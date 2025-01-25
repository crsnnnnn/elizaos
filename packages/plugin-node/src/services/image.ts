import {
    elizaLogger,
    getEndpoint,
    IAgentRuntime,
    IImageDescriptionService,
    ModelProviderName,
    models,
    Service,
    ServiceType,
} from "@elizaos/core";
import {
    AutoProcessor,
    AutoTokenizer,
    env,
    Florence2ForConditionalGeneration,
    Florence2Processor,
    PreTrainedModel,
    PreTrainedTokenizer,
    RawImage,
    type Tensor,
} from "@huggingface/transformers";
import fs from "fs";
import gifFrames from "gif-frames";
import os from "os";
import path from "path";

const DEFAULT_CHART_ANALYSIS = `Provide a technical analysis of this chart following this structure:

1. Chart Overview:
- Identify the trading pair/token
- Timeframe shown
- Current price

2. Price Action:
- Major trend movements and their timing
- Current trend direction
- Pattern formations
- Key price levels and movements

3. Volume Analysis:
- Volume patterns
- Notable volume spikes
- Current volume conditions
- Volume-price relationship

4. Technical Indicators:
- Identify visible indicators (RSI, MACD, etc.)
- Current readings
- Signal interpretations
- Overbought/Oversold conditions

5. Price Structure:
- Support and resistance levels
- Current trading range
- Market structure (Higher Highs/Lower Lows)
- Current consolidation or breakout patterns`;

const IMAGE_DESCRIPTION_PROMPT = (userQuery: string) => {
    if (!userQuery) {
        // Default technical analysis when no user query
        return `If this is not a trading chart, respond only with: "This is not a trading chart. I can only analyze trading charts."

Looking at this trading chart, provide:
1. Trading pair and timeframe first
2. Full technical analysis including:
   - Price action and key levels
   - Volume analysis
   - Technical indicators
   - Support/resistance levels
   - Trading opportunities`;
    }

    // When user provides specific instructions
    return `IMPORTANT - YOU MUST FOLLOW THESE STEPS EXACTLY:

1. First identify the trading pair and timeframe
2. Then, ONLY answer this specific request: ${userQuery}
3. DO NOT provide any other analysis beyond what was specifically requested
4. If this is not a trading chart, respond only with: "This is not a trading chart. I can only analyze trading charts."

Remember: STRICTLY follow the user's request - nothing more, nothing less.`;
};

// const IMAGE_DESCRIPTION_PROMPT = (userQuery: string) => {
//     if (userQuery) {
//         return `Looking at this chart, ${userQuery}

// Important:
// 1. Start your response by identifying the trading pair and timeframe
// 2. Focus ONLY on answering the specific request
// 3. Be concise and direct
// 4. If this is not a trading chart, please analyze what the image is about, inform the user with a very short description and also let the user know that you only analyze charts, but tell that in a FUNNY and FRIENDLY way.

// If this is a trading chart, provide your analysis focusing on the user's specific request.`;
//     }

//     return `First, determine if this is a trading chart.

// If this is NOT a trading chart, analyze what the image is about, inform the user with a short description and also let the user know that you only analyze charts, but tell that in a FUNNY and FRIENDLY way.

// If this IS a trading chart, then:
// ${DEFAULT_CHART_ANALYSIS}

// Be precise with numbers and technical terms.`;
// };

interface ImageProvider {
    initialize(): Promise<void>;
    describeImage(
        imageData: Buffer,
        mimeType: string,
        caption?: string
    ): Promise<{ title: string; description: string }>;
}

// Utility functions
const convertToBase64DataUrl = (
    imageData: Buffer,
    mimeType: string
): string => {
    const base64Data = imageData.toString("base64");
    return `data:${mimeType};base64,${base64Data}`;
};

const handleApiError = async (
    response: Response,
    provider: string
): Promise<never> => {
    const responseText = await response.text();
    elizaLogger.error(
        `${provider} API error:`,
        response.status,
        "-",
        responseText
    );
    throw new Error(`HTTP error! status: ${response.status}`);
};

const parseImageResponse = (
    text: string
): { title: string; description: string } => {
    const [title, ...descriptionParts] = text.split("\n");
    return { title, description: descriptionParts.join("\n") };
};

class LocalImageProvider implements ImageProvider {
    private model: PreTrainedModel | null = null;
    private processor: Florence2Processor | null = null;
    private tokenizer: PreTrainedTokenizer | null = null;
    private modelId: string = "onnx-community/Florence-2-base-ft";

    async initialize(): Promise<void> {
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        env.backends.onnx.logLevel = "fatal";
        env.backends.onnx.wasm.proxy = false;
        env.backends.onnx.wasm.numThreads = 1;

        elizaLogger.info("Downloading Florence model...");
        this.model = await Florence2ForConditionalGeneration.from_pretrained(
            this.modelId,
            {
                device: "gpu",
                progress_callback: (progress) => {
                    if (progress.status === "downloading") {
                        const percent = (
                            (progress.loaded / progress.total) *
                            100
                        ).toFixed(1);
                        const dots = ".".repeat(
                            Math.floor(Number(percent) / 5)
                        );
                        elizaLogger.info(
                            `Downloading Florence model: [${dots.padEnd(20, " ")}] ${percent}%`
                        );
                    }
                },
            }
        );

        elizaLogger.info("Downloading processor...");
        this.processor = (await AutoProcessor.from_pretrained(
            this.modelId
        )) as Florence2Processor;

        elizaLogger.info("Downloading tokenizer...");
        this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
        elizaLogger.success("Image service initialization complete");
    }

    async describeImage(
        imageData: Buffer
    ): Promise<{ title: string; description: string }> {
        if (!this.model || !this.processor || !this.tokenizer) {
            throw new Error("Model components not initialized");
        }

        const base64Data = imageData.toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64Data}`;
        const image = await RawImage.fromURL(dataUrl);
        const visionInputs = await this.processor(image);
        const prompts = this.processor.construct_prompts("<DETAILED_CAPTION>");
        const textInputs = this.tokenizer(prompts);

        elizaLogger.log("Generating image description");
        const generatedIds = (await this.model.generate({
            ...textInputs,
            ...visionInputs,
            max_new_tokens: 256,
        })) as Tensor;

        const generatedText = this.tokenizer.batch_decode(generatedIds, {
            skip_special_tokens: false,
        })[0];

        const result = this.processor.post_process_generation(
            generatedText,
            "<DETAILED_CAPTION>",
            image.size
        );

        const detailedCaption = result["<DETAILED_CAPTION>"] as string;
        return { title: detailedCaption, description: detailedCaption };
    }
}

class OpenAIImageProvider implements ImageProvider {
    private runtime: IAgentRuntime;

    constructor(runtime: IAgentRuntime) {
        this.runtime = runtime;
    }

    async initialize(): Promise<void> {
        // Initialize method is required by the interface
        // Can be empty if no initialization is needed
    }

    async describeImage(
        imageData: Buffer,
        mimeType: string,
        userCaption?: string
    ): Promise<{ title: string; description: string }> {
        try {
            const base64Image = imageData.toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64Image}`;

            // Create system message to enforce behavior
            const messages = [
                {
                    role: "system",
                    content: "You are a trading chart analysis assistant. When given specific instructions with a chart, you must ONLY follow those instructions exactly. Do not provide any additional analysis unless specifically requested."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: userCaption
                                ? `Looking at this chart: ${userCaption}`
                                : "Provide a complete technical analysis of this chart. Include: trading pair, timeframe, price action, volume, indicators, and potential setups."
                        },
                        {
                            type: "image_url",
                            image_url: { url: dataUrl }
                        }
                    ]
                }
            ];

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.runtime.getSetting("OPENAI_API_KEY")}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: messages,
                    max_tokens: 500,
                }),
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status} - ${responseText}`);
            }

            const data = JSON.parse(responseText);
            return parseImageResponse(data.choices[0].message.content);
        } catch (error) {
            elizaLogger.error('Error in OpenAIImageProvider:', error);
            throw error;
        }
    }
}


class GoogleImageProvider implements ImageProvider {
    constructor(private runtime: IAgentRuntime) {}

    async initialize(): Promise<void> {}

    async describeImage(
        imageData: Buffer,
        mimeType: string
    ): Promise<{ title: string; description: string }> {
        const endpoint = getEndpoint(ModelProviderName.GOOGLE);
        const apiKey = this.runtime.getSetting("GOOGLE_GENERATIVE_AI_API_KEY");

        const response = await fetch(
            `${endpoint}/v1/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: IMAGE_DESCRIPTION_PROMPT },
                                {
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: imageData.toString("base64"),
                                    },
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        if (!response.ok) {
            await handleApiError(response, "Google Gemini");
        }

        const data = await response.json();
        return parseImageResponse(data.candidates[0].content.parts[0].text);
    }
}

export class ImageDescriptionService
    extends Service
    implements IImageDescriptionService
{
    static serviceType: ServiceType = ServiceType.IMAGE_DESCRIPTION;

    private initialized: boolean = false;
    private runtime: IAgentRuntime | null = null;
    private provider: ImageProvider | null = null;

    getInstance(): IImageDescriptionService {
        return ImageDescriptionService.getInstance();
    }

    async initialize(runtime: IAgentRuntime): Promise<void> {
        elizaLogger.log("Initializing ImageDescriptionService");
        this.runtime = runtime;
    }

    private async initializeProvider(): Promise<void> {
        if (!this.runtime) {
            throw new Error("Runtime is required for image recognition");
        }

        const model = models[this.runtime?.character?.modelProvider];

        if (this.runtime.imageVisionModelProvider) {
            if (
                this.runtime.imageVisionModelProvider ===
                ModelProviderName.LLAMALOCAL
            ) {
                this.provider = new LocalImageProvider();
                elizaLogger.debug("Using llama local for vision model");
            } else if (
                this.runtime.imageVisionModelProvider ===
                ModelProviderName.GOOGLE
            ) {
                this.provider = new GoogleImageProvider(this.runtime);
                elizaLogger.debug("Using google for vision model");
            } else if (
                this.runtime.imageVisionModelProvider ===
                ModelProviderName.OPENAI
            ) {
                this.provider = new OpenAIImageProvider(this.runtime);
                elizaLogger.debug("Using openai for vision model");
            } else {
                elizaLogger.error(
                    `Unsupported image vision model provider: ${this.runtime.imageVisionModelProvider}`
                );
            }
        } else if (model === models[ModelProviderName.LLAMALOCAL]) {
            this.provider = new LocalImageProvider();
            elizaLogger.debug("Using llama local for vision model");
        } else if (model === models[ModelProviderName.GOOGLE]) {
            this.provider = new GoogleImageProvider(this.runtime);
            elizaLogger.debug("Using google for vision model");
        } else {
            elizaLogger.debug("Using default openai for vision model");
            this.provider = new OpenAIImageProvider(this.runtime);
        }

        await this.provider.initialize();
        this.initialized = true;
    }

    private async loadImageData(
        imageUrl: string
    ): Promise<{ data: Buffer; mimeType: string }> {
        const isGif = imageUrl.toLowerCase().endsWith(".gif");
        let imageData: Buffer;
        let mimeType: string;

        if (isGif) {
            const { filePath } = await this.extractFirstFrameFromGif(imageUrl);
            imageData = fs.readFileSync(filePath);
            mimeType = "image/png";
            fs.unlinkSync(filePath); // Clean up temp file
        } else {
            if (fs.existsSync(imageUrl)) {
                imageData = fs.readFileSync(imageUrl);
                const ext = path.extname(imageUrl).slice(1);
                mimeType = ext ? `image/${ext}` : "image/jpeg";
            } else {
                const response = await fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch image: ${response.statusText}`
                    );
                }
                imageData = Buffer.from(await response.arrayBuffer());
                mimeType = response.headers.get("content-type") || "image/jpeg";
            }
        }

        if (!imageData || imageData.length === 0) {
            throw new Error("Failed to fetch image data");
        }

        return { data: imageData, mimeType };
    }

    private async extractFirstFrameFromGif(
        gifUrl: string
    ): Promise<{ filePath: string }> {
        const frameData = await gifFrames({
            url: gifUrl,
            frames: 1,
            outputType: "png",
        });

        const tempFilePath = path.join(
            os.tmpdir(),
            `gif_frame_${Date.now()}.png`
        );

        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tempFilePath);
            frameData[0].getImage().pipe(writeStream);
            writeStream.on("finish", () => resolve({ filePath: tempFilePath }));
            writeStream.on("error", reject);
        });
    }

    async describeImage(imageInput: string | Buffer): Promise<{ title: string; description: string }> {
        if (!this.initialized) {
            await this.initializeProvider();
        }

        try {
            let imageData: Buffer;
            let mimeType = 'image/jpeg';  // Default MIME type

            if (Buffer.isBuffer(imageInput)) {
                // If we received a Buffer directly
                imageData = imageInput;
            } else if (typeof imageInput === 'string') {
                // If we received a URL or file path
                const response = await fetch(imageInput);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image: ${response.statusText}`);
                }
                imageData = Buffer.from(await response.arrayBuffer());
            } else {
                throw new Error('Invalid image input type');
            }

            return await this.provider!.describeImage(imageData, mimeType);
        } catch (error) {
            elizaLogger.error("Error in ImageDescriptionService:", error);
            throw error;
        }
    }
}


export default ImageDescriptionService;
