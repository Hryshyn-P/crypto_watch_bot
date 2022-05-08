import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api';
import { WebsocketClient, DefaultLogger } from 'binance'

const token = process.env.TELEGRAM_BOT_KEY;
const bot = new TelegramBot(token, { polling: true });
const wsClient = new WebsocketClient({ beautify: true });

wsClient.subscribeSpotTrades('BTCUSDT');
// receive raw events
wsClient.on('message', (data) => {
    console.log('raw message received ', JSON.stringify(data, null, 2));

    bot.onText(/\/start/, (msg) => {
        bot.sendMessage(msg.chat.id,
            `"Hey, I'm a brand new Telegram bot. I live inside a Sanity tutorial."`);
    });
});
