import 'dotenv/config';
import Axios from 'axios';
import crypto from 'crypto';

// Telegram bot token
const botToken = process.env.TELEGRAM_BOT_KEY;
// Binance API endpoint for trading
const binanceOrder = process.env.BINANCE_ORDER;
const binaceAccount = process.env.BINANCE_ACCOUNT;
// Binance API key and secret
const binanceApiKey = process.env.BINANCE_API_KEY;
const binanceApiSecret = process.env.BINANCE_API_SECRET;

// Function to send a message to Telegram user
async function sendMessage(chatId, message) {
  try {
    const response = await Axios.get(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${message}`);
    console.log(response.data);
  } catch (error) {
    console.log(error);
  }
}
// placeOrder(12345678, 'BTCUSDT', 'BUY', 0.01, 10000);
async function placeOrder(chatId, symbol, side, quantity, price) {
  try {
    const headers = {
      'X-MBX-APIKEY': binanceApiKey,
    };
    const params = {
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity,
      price,
    };
    const response = await Axios.post(binanceOrder, {}, {headers, params});
    if (response.data.msg) {
      sendMessage(chatId, response.data.msg);
    } else {
      sendMessage(chatId, 'Trade executed successfully');
    }
  } catch (error) {
    console.log(error);
    sendMessage(chatId, `${error.name}\n${error.message}`);
  }
}

async function cancelOrder(chatId, symbol, orderId) {
  try {
    const timestamp = Date.now();
    const signature = crypto.createHmac('sha256', apiSecret).update(`symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`).digest('hex');
    const headers = {
      'X-MBX-APIKEY': apiKey,
      'X-MBX-SIGNATURE': signature,
    };
    const params = {
      symbol,
      orderId,
      timestamp,
    };
    const response = await Axios.delete(binanceOrder, {headers, params});
    if (response.data.msg) {
      sendMessage(chatId, response.data.msg);
    } else {
      sendMessage(chatId, 'Order canceled successfully');
    }
  } catch (error) {
    console.log(error);
    sendMessage(chatId, `${error.name}\n${error.message}`);
  }
}

async function getBalance(chatId) {
  try {
    const timestamp = Date.now();
    const signature = crypto.createHmac('sha256', binanceApiSecret).update(`timestamp=${timestamp}`).digest('hex');
    const headers = {
      'X-MBX-APIKEY': apiKey,
      'X-MBX-SIGNATURE': signature,
    };
    const params = {
      timestamp,
    };
    const response = await Axios.get(binaceAccount, {headers, params});
    let balances = '';
    for (let i=0; i<response.data.balances.length; i++) {
      balances += `${response.data.balances[i].asset}: ${response.data.balances[i].free} ${response.data.balances[i].locked}\n`;
    }
    sendMessage(chatId, balances);
  } catch (error) {
    console.log(error);
    sendMessage(chatId, `${error.name}\n${error.message}`);
  }
}

export {placeOrder, cancelOrder, getBalance};
