export abstract class Character {
    abstract name: string;
    abstract description: string;
    abstract processMessage(message: string): Promise<string>;

    protected capabilities: Map<string, Function> = new Map();

    protected addCapability(name: string, fn: Function) {
        this.capabilities.set(name, fn);
    }
}