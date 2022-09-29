import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api';
import Axios from 'axios'
import _ from 'lodash'
import fetch from 'node-fetch';
import * as helper from './util/helper.js'

const token = process.env.TELEGRAM_BOT_KEY;

/**
 * @class TelegramBot
 */
const bot = new TelegramBot(token, { polling: true });
const symbolRegex = /^[\w.-]+$/;
const onlyNumRegex = /\d+/;

let involvedSymbols = [];
let stop = false;
let message;
let priceLength;
let symbolInfo = [];
let firstMessage = true;
let initIntervalID;

const getAllSymbols = (symbols) => {
    const coins = []
    symbols.forEach(symbol => {
        coins.push(symbol.baseAsset)
        coins.push(symbol.quoteAsset)
    })
    return _.uniq(coins)
}

async function printAllSymbols(chatId) {
    try {
        fetch(process.env.ALL_SYMBOLS_URI)
            .then(response => response.json())
            .then(json => getAllSymbols(json.symbols))
            .then(coins => bot.sendMessage(chatId, JSON.stringify(coins)))
    } catch (err) {
        await bot.sendMessage(chatId, err.message)
        return;
    }
}

async function getTradingPairPrice(symbol, intervalId, chatId) {
    try {
        if (symbol.startsWith('["') && symbol.endsWith('"]')) {
            message = await Axios.get(`${process.env.LAST_PRICE_URI}s=${symbol}`);
            message.data.forEach(e => involvedSymbols = [...new Set([...involvedSymbols, e.symbol])]);
            return symbol;
        }
    } catch (err) {
        await bot.sendMessage(chatId, `${err?.response?.data?.msg} Wrong dataset: ${symbol} 😕` || err.message);
        terminateSender(intervalId);
        return 'error';
    }
}

function calculateProcentOfNextPrice(priceLength, isSingleSymbol) {
    if (message != undefined) {
        const processSingleSymbol = (price, s, index) => {
            // #region Fill symbol data obj
            let i = symbolInfo.findIndex(el => el[s]);

            try {
                symbolInfo[i][s];
            } catch (err) {
                symbolInfo.push({ [s]: { tProc: 0 } });
                i = symbolInfo.findIndex(el => el[s]);
            }

            const priceVector = (symbolInfo[i][s].prevPrice > price) ? ' 🍅' : ' 🥝+';
            const procent = helper.isWhatPercentOf(symbolInfo[i][s].prevPrice || price, price);

            symbolInfo[i][s].tProc += procent;
            symbolInfo[i][s].prevPrice = price;
            symbolInfo[i][s].priceVector = priceVector;
            symbolInfo[i][s].procent = procent;
            // #endregion

            // #region Change price length
            if (priceLength && helper.inRange(priceLength) &&
                priceLength < `${String(price).replace(/\D/g, '')}`.length) {

                const tempPrice = String(price).substring(0, priceLength);
                price = tempPrice.includes('.') ?
                    helper.trimNum(String(price).substring(0, priceLength + 1)) :
                    helper.trimNum(String(price).substring(0, priceLength));
            }
            // #endregion

            // #region Build output string
            price += priceVector + `${procent.toFixed(3)}%` + (String(symbolInfo[i][s].tProc).startsWith('-') ?
                ` ⬇️${helper.trimNum(String(symbolInfo[i][s].tProc).substring(0, 4))}` :
                ` ⬆️+${helper.trimNum(String(symbolInfo[i][s].tProc).substring(0, 3))}`);
            if (price.endsWith('0')) price = price.slice(0, -4) + '🍋0';
            isSingleSymbol ? message.data.price = price : message.data[index].price = price;
            // #endregion
        }

        if (!isSingleSymbol) {
            message.data.forEach((e, i) => {
                processSingleSymbol(+e.price, e.symbol, i);
            })
        } else {
            processSingleSymbol(+message.data.price, message.data.symbol);
        }
    }
}

function upsertSymbols(msgText) {
    return _.uniq(_.uniq(msgText.split(' ').map(s => { return s.toUpperCase() }))
        .map(s => { return s.length < 5 ? `${s}BUSD` : s })
        .concat(involvedSymbols));
}

function terminateSender(intervalId) {
    priceLength = undefined;
    symbolInfo = [];
    involvedSymbols = [];
    firstMessage = true;
    stop = true;
    clearInterval(intervalId);
}

async function processMultipleSymbols(msg, intervalId) {
    const symbols = upsertSymbols(msg.text);
    const returnedSymbols = await getTradingPairPrice('["' + symbols.join('","') + '"]', intervalId, msg.chat.id);
    let arrOfmessages = [];
    let multipartMessage = '';

    if (returnedSymbols !== 'error') {
        calculateProcentOfNextPrice(priceLength, false);
        message.data.forEach(async e => {
            if (e.symbol.endsWith('USDT') || e.symbol.endsWith('BUSD')) {
                e.symbol = e.symbol.slice(0, -4);
            }
            arrOfmessages.push(`${e.symbol === 'BTC' ? `🦁${e.symbol}` :
                `🦎${e.symbol}`}: ${e.price}\n`)
        })
    } else {
        return;
    }
    arrOfmessages.sort().map((part, i) => {
        i === 0 && involvedSymbols.length > 1 ?
            multipartMessage += `🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜\n${part}` : multipartMessage += part
    });

    arrOfmessages = [];

    if (multipartMessage !== '') {
        await bot.sendMessage(msg.chat.id, multipartMessage);
        multipartMessage = '';
    }
}

bot.on('message', async (msg) => {
    stop = false;
    // Set number of price digits with command "/num" like "/num 10", by default 14
    if (msg.text.startsWith('/num ') && helper.inRange(+msg.text.match(onlyNumRegex))) {
        priceLength = +msg.text.match(onlyNumRegex);
    }
    if (msg.text === '/symbols') {
        await printAllSymbols(msg.chat.id);
    } else {
        // #region Cycle for sending messages
        const intervalId = setInterval(async () => {
            if (msg.text === '/stop' || stop === true) {
                terminateSender(intervalId);
                return;
            } else {
                stop = false;
            }
            if ((msg.text.split(' ').length <= 20 &&
                msg.text.split(' ').every(s => { return s.match(symbolRegex) })) ||
                msg.text === '/start') {

                if (initIntervalID === Number(intervalId) || firstMessage) {
                    initIntervalID = Number(intervalId);
                    firstMessage = false;
                    msg.text === '/start' ?
                        await processMultipleSymbols({ text: 'btc eth etc bnb', chat: { id: msg.chat.id } }, intervalId) :
                        await processMultipleSymbols(msg, intervalId);
                } else {
                    involvedSymbols = msg.text === '/start' ? upsertSymbols('btc eth etc bnb') : upsertSymbols(msg.text);
                    clearInterval(intervalId);
                }
            }
        }, 4000);
        // #endregion
    };
});
