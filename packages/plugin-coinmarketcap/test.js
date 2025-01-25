// test.js
import axios from 'axios';

const API_KEY = 'bc16707b-041c-4d4f-9b00-c9ac0f7b1dc8'; // Use your actual API key
const BASE_URL = "https://pro-api.coinmarketcap.com/v1";

async function testPrice() {
    try {
        console.log('Testing ETH price fetch...');
        const response = await axios.get(`${BASE_URL}/cryptocurrency/quotes/latest`, {
            headers: {
                'X-CMC_PRO_API_KEY': API_KEY
            },
            params: {
                symbol: 'ETH',
                convert: 'USD'
            }
        });

        console.log('Full API Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

testPrice();