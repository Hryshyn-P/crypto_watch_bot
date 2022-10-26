import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import Axios from 'axios';
import _ from 'lodash';
import fetch from 'node-fetch';
import * as helper from './util/helper.js';

const token = process.env.TELEGRAM_BOT_KEY;

/**
 * @class TelegramBot
 */
const bot = new TelegramBot(token, {polling: true});
const symbolRegex = /^[\w.-]+$/;
const onlyNumRegex = /\d+/;
const chats = {};

const getAllSymbols = (symbols) => {
  const coins = [];
  symbols.forEach((symbol) => {
    coins.push(symbol.baseAsset);
    coins.push(symbol.quoteAsset);
  });
  return _.uniq(coins);
};

async function printAllSymbols(chatId) {
  try {
    fetch(process.env.ALL_SYMBOLS_URI)
      .then((response) => response.json())
      .then((json) => getAllSymbols(json.symbols))
      .then((coins) => bot.sendMessage(chatId, JSON.stringify(coins)));
  } catch (err) {
    await bot.sendMessage(chatId, err.message);
    return;
  }
}

async function getTradingPairPrice(symbol, chatId) {
  try {
    if (symbol.startsWith('["') && symbol.endsWith('"]')) {
      chats[chatId].message = await Axios.get(`${process.env.LAST_PRICE_URI}s=${symbol}`);
      chats[chatId].message.data.forEach((e) => chats[chatId]
        .involvedSymbols = [...new Set([...chats[chatId].involvedSymbols, e.symbol])]);
      return symbol;
    }
  } catch (err) {
    await bot.sendMessage(chatId, `${err?.response?.data?.msg} Wrong dataset: ${symbol} 😕` || err.message);
    terminateSender(chatId);
    return 'error';
  }
}

function processSingleSymbol(chatId, priceLength, price, smb, idx) {
  if (!chats[chatId][smb]) chats[chatId][smb] = {deviation: 0, prevPrice: 0};

  const priceVector = (chats[chatId][smb].prevPrice > price) ? ' 🍅' : ' 🥝+';
  const procent = helper.isWhatPercentOf(chats[chatId][smb].prevPrice || price, price);

  chats[chatId][smb] = {
    deviation: chats[chatId][smb].deviation += procent,
    prevPrice: price,
    priceVector,
    procent,
  };
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
  price += priceVector + `${procent.toFixed(3)}%` + (String(chats[chatId][smb].deviation).startsWith('-') ?
    ` ⬇️${helper.trimNum(String(chats[chatId][smb].deviation).substring(0, 4))}` :
    ` ⬆️+${helper.trimNum(String(chats[chatId][smb].deviation).substring(0, 3))}`);
  if (price.endsWith('0')) price = price.slice(0, -4) + '🍋0';
  chats[chatId].message.data[idx].price = price;
  // #endregion
};

function calculateProcentOfNextPrice(chatId, priceLength) {
  if (chats[chatId].message) {
    chats[chatId].message.data.forEach((e, i) => {
      processSingleSymbol(chatId, priceLength, +e.price, e.symbol, i);
    });
  }
}

function upsertSymbols(msg) {
  return _.uniq(_.uniq(msg.text.split(' ').map((s) => {
    return s.toUpperCase();
  }))
    .map((s) => {
      return s.length < 6 ? `${s}BUSD` : s;
    })
    .concat(chats[msg.chat.id].involvedSymbols));
}

function terminateSender(chatId) {
  clearInterval(chats[chatId].intervalId);
  chats[chatId] = {};
}

async function processMultipleSymbols(msg) {
  const symbols = upsertSymbols(msg);
  const returnedSymbols = await getTradingPairPrice('["' + symbols.join('","') + '"]', msg.chat.id);
  let arrOfmessages = [];

  if (returnedSymbols !== 'error') {
    calculateProcentOfNextPrice(msg.chat.id, chats[msg.chat.id].priceLength);
    chats[msg.chat.id].message.data.forEach(async (e) => {
      if (e.symbol.endsWith('USDT') || e.symbol.endsWith('BUSD')) {
        e.symbol = e.symbol.slice(0, -4);
      }
      arrOfmessages.push(`${e.symbol === 'BTC' ? `🦁${e.symbol}` :
        `🦎${e.symbol}`}: ${e.price}\n`);
    });
  } else {
    return;
  }
  arrOfmessages.sort().map((part, i) => {
    i === 0 && chats[msg.chat.id].involvedSymbols.length > 1 ?
      chats[msg.chat.id].multipartMessage += `🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜🦜\n${part}` :
      chats[msg.chat.id].multipartMessage += part;
  });

  arrOfmessages = [];

  if (chats[msg.chat.id].multipartMessage !== '') {
    await bot.sendMessage(msg.chat.id, chats[msg.chat.id].multipartMessage);
    chats[msg.chat.id].multipartMessage = '';
  }
}

bot.on('message', async (msg) => {
  if (chats[msg.chat.id]?.firstMessage === undefined) {
    chats[msg.chat.id] = {
      firstMessage: true,
      involvedSymbols: [],
      multipartMessage: '',
    };
  }
  chats[msg.chat.id].request = msg;

  // Set number of price digits with command "/num" like "/num 10", by default 14
  if (msg.text.startsWith('/num ') && helper.inRange(+msg.text.match(onlyNumRegex))) {
    chats[msg.chat.id].priceLength = +msg.text.match(onlyNumRegex);
  }
  if (msg.text === '/symbols') {
    await printAllSymbols(msg.chat.id);
  } else {
    // #region Cycle for sending messages

    const intervalId = setInterval(async () => {
      if (!chats[msg.chat.id].intervalId) chats[msg.chat.id].intervalId = intervalId;

      if (msg.text === '/stop') {
        terminateSender(msg.chat.id);
        return;
      }
      if ((msg.text.split(' ').length <= 20 &&
                msg.text.split(' ').every((s) => {
                  return s.match(symbolRegex);
                })) || msg.text === '/start') {
        if (chats[msg.chat.id].initIntervalID === Number(intervalId) || chats[msg.chat.id].firstMessage) {
          chats[msg.chat.id].initIntervalID = Number(intervalId);
          chats[msg.chat.id].firstMessage = false;
          msg.text === '/start' ?
            await processMultipleSymbols({text: 'btc eth etc bnb', chat: {id: msg.chat.id}}) :
            await processMultipleSymbols(msg);
        } else {
          chats[msg.chat.id].involvedSymbols = msg.text === '/start' ?
            upsertSymbols({text: 'btc eth etc bnb', chat: {id: msg.chat.id}}) : upsertSymbols(msg);
          clearInterval(intervalId);
        }
      }
    }, 4000);
    // #endregion
  };
});
