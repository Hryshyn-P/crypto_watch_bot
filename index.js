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

let involvedSymbols = []; // Use for input validation in future...
let stop = false;
let message;
let priceLength;
let symbolInfo = [];

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
        if (symbol.length < 5) {
            message = await Axios.get(`${process.env.LAST_PRICE_URI}=${symbol}BUSD`)
            involvedSymbols = [...new Set([...involvedSymbols, `${symbol}BUSD`])]
            return symbol;
        }
        if (symbol.startsWith('["') && symbol.endsWith('"]')) {
            message = await Axios.get(`${process.env.LAST_PRICE_URI}s=${symbol}`);
            message.data.forEach(e => involvedSymbols = [...new Set([...involvedSymbols, e.symbol])]);
            return symbol;
        }
        message = await Axios.get(`${process.env.LAST_PRICE_URI}=${symbol}`)
        involvedSymbols = [...new Set([...involvedSymbols, symbol])]
        return symbol;
    } catch (err) {
        if (symbol.length < 5) {
            await bot.sendMessage(chatId, `${err?.response?.data?.msg} Or pair ${symbol} - BUSD missing. 😕` || err.message);
        } else if (symbol.startsWith('["') && symbol.endsWith('"]')) {
            await bot.sendMessage(chatId, `${err?.response?.data?.msg} Wrong dataset: ${symbol} 😕` || err.message);
        }
        else {
            await bot.sendMessage(chatId, `${err?.response?.data?.msg} Or pair ${symbol} missing. 😕` || err.message);
        }
        clearInterval(intervalId);
        stop = true;
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

async function printTradingPairPrice(chatId, symbol) {
    if (message != undefined) {
        if (symbol.endsWith('USDT') || symbol.endsWith('BUSD')) {
            symbol = symbol.slice(0, -4);
        }
        await bot.sendMessage(chatId, `${symbol === 'BTC' ? `🦁${symbol}` : `🦎${symbol}`}: ${message.data.price}`);
        message = undefined;
    }
}


bot.on('message', async (msg) => {
    // Set number of price digits with command "/num" like "/num 10", by default 14
    if (msg.text.startsWith('/num ') && helper.inRange(+msg.text.match(onlyNumRegex))) {
        priceLength = +msg.text.match(onlyNumRegex);
    }

    stop = false;

    if (msg.text === '/symbols') {
        await printAllSymbols(msg.chat.id);
    } else {
        let arrOfmessages = [];
        let multipartMessage = '';

        async function processMultipleSymbols(msg) {
            const symbols = _.uniq(msg.text.split(' ').map(s => { return s.toUpperCase() }))
                .map(s => { return s.length < 5 ? `${s}BUSD` : s });

            const returnedSymbols = await getTradingPairPrice('["' + symbols.join('","') + '"]', intervalId, msg.chat.id);

            if (returnedSymbols !== 'error') {
                calculateProcentOfNextPrice(priceLength, false);
                message.data.forEach(async e => {
                    if (e.symbol.endsWith('USDT') || e.symbol.endsWith('BUSD')) {
                        e.symbol = e.symbol.slice(0, -4);
                    }
                    arrOfmessages.push(`${e.symbol === 'BTC' ? `🦁${e.symbol}` :
                        `🦎${e.symbol}`}: ${e.price}\n`)
                })
            }
            arrOfmessages.sort().map((part, i) => {
                i === 0 ? multipartMessage += `🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜\n${part}` : multipartMessage += part
            });

            arrOfmessages = [];

            if (multipartMessage !== '') {
                await bot.sendMessage(msg.chat.id, multipartMessage);
                multipartMessage = '';
            }
        }

        // #region Cycle for sending messages
        const intervalId = setInterval(async () => {
            if (msg.text === '/stop' || stop === true) {
                priceLength = undefined;
                symbolInfo = [];
                stop = true;
                clearInterval(intervalId);
                return;
            } else {
                stop = false;
            }
            if (msg.text.split(' ').length > 1 &&
                msg.text.split(' ').length <= 20 &&
                msg.text.split(' ').every(s => { return s.match(symbolRegex) })) {

                await processMultipleSymbols(msg)

            } else {
                if (!msg.text.startsWith('/num ')) {
                    let symbol;
                    msg.text.match(symbolRegex) ?
                        symbol = msg.text.toUpperCase() :
                        await processMultipleSymbols({ text: 'btc eth etc bnb', chat: { id: msg.chat.id } });

                    if (symbol) {
                        symbol = await getTradingPairPrice(symbol, intervalId, msg.chat.id);
                        if (symbol !== 'error') {
                            calculateProcentOfNextPrice(priceLength, true);
                            await printTradingPairPrice(msg.chat.id, symbol);
                        }
                    }
                }
            }
        }, 4000);
        // #endregion
    };
});
