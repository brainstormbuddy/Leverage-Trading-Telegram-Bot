import { Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

import * as TelegramBot from 'node-telegram-bot-api';

import { ethers } from 'ethers';
import * as PKtoAddress from 'ethereum-private-key-to-address';
import * as crypto from 'crypto';

import { Transaction, TransactionDocument } from './schemas/transaction.schema';

import { ITransaction, IMatchParams } from './interfaces/transaction.interface';

import { ChainStatus } from 'src/utils/types';
import { convertEnumToChain } from 'src/utils/helper';

import * as ERC20_USDC_MAINNET_ABI from '../abis/ERC20_USDC_MAINNET.json';
import * as ERC20_USDC_TESTNET_ABI from '../abis/ERC20_USDC_TESTNET.json';
import * as ERC20_Vault_MAINNET_ABI from '../abis/ERC20_Vault_MAINNET.json';
import * as ERC20_Vault_TESTNET_ABI from '../abis/ERC20_Vault_MAINNET.json';

import { isProduction } from 'src/utils/config';

@Injectable()
export class BotService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly TransactionModel: Model<TransactionDocument>,
  ) {
    this.botInteraction();
  }

  botInteraction() {
    const token = '6379730767:AAGNn_isZzu6tbbqldSGIMx9XLZeRIwJX5w';
    const bot = new TelegramBot(token, { polling: true });
    const valuesMap = {};

    function generateShortIdentifier(index) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; // You can extend this for more values
      return alphabet[index];
    }

    function generateNonce() {
      const buffer = crypto.randomBytes(6); // 6 bytes = 48 bits
      return buffer.readUIntLE(0, 6);
    }

    const vaultContractAddress = isProduction
      ? process.env.ARBITRUM_VAULT_MAINNET_ADDRESS
      : process.env.ARBITRUM_VAULT_TESTNET_ADDRESS;

    const provider = new ethers.providers.JsonRpcProvider(
      convertEnumToChain(ChainStatus.Arbitrum),
    );

    const ERC20_Vault_ABI = isProduction
      ? ERC20_Vault_MAINNET_ABI
      : ERC20_Vault_TESTNET_ABI;

    const ERC20_USDC_ABI = isProduction
      ? ERC20_USDC_MAINNET_ABI
      : ERC20_USDC_TESTNET_ABI;

    bot.onText(/\/echo (.+)/, (msg, match) => {
      // 'msg' is the received Message from Telegram
      // 'match' is the result of executing the regexp above on the text content
      // of the message

      const chatId = msg.chat.id;
      const resp = match[1]; // the captured "whatever"

      // send back the matched "whatever" to the chat
      bot.sendMessage(chatId, resp);
    });

    bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '💰 Import Private Key',
                callback_data: 'import_pk',
              },
            ],
            [
              {
                text: 'Create Wallet',
                callback_data: 'create_wallet',
              },
            ],
          ],
        },
      };

      bot.sendMessage(
        chatId,
        '👋 Welcome to the Leverage Trading Bot! 👋 \n Please enter the private key of your wallet.',
        options,
      );
    });

    bot.on('callback_query', async (callbackQuery) => {
      const action = callbackQuery.data;
      const msg = callbackQuery.message;
      const chatId = msg.chat.id;
      let options;

      console.log('action ==>', action);

      if (msg.message_id) bot.deleteMessage(chatId, msg.message_id);

      switch (action) {
        case 'import_pk':
          const PKPrompt = await bot.sendMessage(
            msg.chat.id,
            'Please enter the private key of your wallet.',
            {
              reply_markup: {
                force_reply: true,
              },
            },
          );
          bot.onReplyToMessage(
            msg.chat.id,
            PKPrompt.message_id,
            async (walletKeyMsg) => {
              bot.deleteMessage(chatId, PKPrompt.message_id);
              bot.deleteMessage(chatId, walletKeyMsg.message_id);

              const walletKey = walletKeyMsg.text;
              try {
                const publicAddr = PKtoAddress(Buffer.from(walletKey, 'hex'));
                options = {
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: 'Deposit',
                          callback_data: 'deposit_token',
                        },
                      ],
                      [
                        {
                          text: 'Withdraw',
                          callback_data: 'withdraw_token',
                        },
                      ],
                      [{ text: 'Back', callback_data: 'import_pk' }],
                    ],
                  },
                };
                await this.createTransaction({
                  chatId: msg.chat.id,
                  walletPrivateKey: walletKey,
                });
                bot.sendMessage(
                  chatId,
                  `The wallet has been successfully set. \nYour wallet address is:\n<code>${publicAddr}</code>\n🥉 Please select an option beyond 🥉.`,
                  options,
                );
              } catch (error) {
                options = {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: '💰 Import Privake Key',
                          callback_data: 'import_pk',
                        },
                      ],
                      [
                        {
                          text: 'Create Wallet',
                          callback_data: 'create_wallet',
                        },
                      ],
                    ],
                  },
                };
                bot.sendMessage(
                  chatId,
                  'The private key is incorrect.',
                  options,
                );
              }
            },
          );
          break;

        case 'create_wallet':
          const id = crypto.randomBytes(32).toString('hex');
          const privateKey = '0x' + id;
          const wallet = new ethers.Wallet(privateKey);
          await this.createTransaction({
            chatId: msg.chat.id,
            walletPrivateKey: id,
          });
          options = {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '💰 Import Private Key',
                    callback_data: 'import_pk',
                  },
                ],
                [{ text: 'Back', callback_data: 'import_pk' }],
              ],
            },
          };
          bot.sendMessage(
            chatId,
            `The wallet has been successfully set.\nYour wallet address is:\n<code>${wallet.address}</code>.\nYour private key is:\n<code>${id}</code>.\n🥉 Please select an option beyond 🥉.`,
            options,
          );
          break;

        case 'deposit_token':
          const depositTransactionRes =
            await this.getRecentTransactionWithParams({
              chatId: msg.chat.id,
            });

          const depositWallet = new ethers.Wallet(
            depositTransactionRes.walletPrivateKey,
            provider,
          );

          const depositContractInteraction = new ethers.Contract(
            vaultContractAddress,
            ERC20_Vault_ABI,
            depositWallet,
          );

          const depositAllAllowedTokens =
            await depositContractInteraction.getAllAllowedToken();

          const depositAllowedTokenContractAddress =
            await depositContractInteraction.allowedToken(
              depositAllAllowedTokens[0],
            );

          const depositAllowedTokenContractInteraction = new ethers.Contract(
            depositAllowedTokenContractAddress,
            ERC20_USDC_ABI,
            depositWallet,
          );

          const depositTokenSymbol =
            await depositAllowedTokenContractInteraction.symbol();

          try {
            options = {
              parse_mode: 'HTML',
              disable_web_page_preview: false,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `${depositTokenSymbol}`,
                      callback_data: `deposit_token-${depositAllowedTokenContractAddress}`,
                    },
                  ],
                ],
              },
            };
            bot.sendMessage(
              chatId,
              `Please choose an allowed token to deposit.`,
              options,
            );
          } catch (error) {
            options = {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '💰 Import Privake Key',
                      callback_data: 'import_pk',
                    },
                  ],
                  [
                    {
                      text: 'Create Wallet',
                      callback_data: 'create_wallet',
                    },
                  ],
                ],
              },
            };
            bot.sendMessage(chatId, 'The private key is incorrect.', options);
          }
          break;

        case 'withdraw_token':
          const withdrawTransactionRes =
            await this.getRecentTransactionWithParams({
              chatId: msg.chat.id,
            });

          const withdrawWallet = new ethers.Wallet(
            withdrawTransactionRes.walletPrivateKey,
            provider,
          );

          const withdrawContractInteraction = new ethers.Contract(
            vaultContractAddress,
            ERC20_Vault_ABI,
            withdrawWallet,
          );

          const withdrawAllAllowedTokens =
            await withdrawContractInteraction.getAllAllowedToken();

          const withdrawAllowedTokenContractAddress =
            await withdrawContractInteraction.allowedToken(
              withdrawAllAllowedTokens[0],
            );

          const allowedTokenContractInteraction = new ethers.Contract(
            withdrawAllowedTokenContractAddress,
            ERC20_USDC_ABI,
            withdrawWallet,
          );

          const withdrawTokenSymbol =
            await allowedTokenContractInteraction.symbol();

          try {
            options = {
              parse_mode: 'HTML',
              disable_web_page_preview: false,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: `${withdrawTokenSymbol}`,
                      callback_data: `withdraw_token-${withdrawAllowedTokenContractAddress}`,
                    },
                  ],
                ],
              },
            };
            bot.sendMessage(
              chatId,
              `Please choose an allowed token to withdraw.`,
              options,
            );
          } catch (error) {
            options = {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '💰 Import Privake Key',
                      callback_data: 'import_pk',
                    },
                  ],
                  [
                    {
                      text: 'Create Wallet',
                      callback_data: 'create_wallet',
                    },
                  ],
                ],
              },
            };
            bot.sendMessage(chatId, 'Privake key is wrong', options);
          }
          break;

        case 'cancel':
          // text = '🙏 Thanks 🙏\n';
          bot.sendMessage(
            msg.chat.id,
            '👋 Welcome to the Leverage Trading Bot! 👋 \n Please enter the private key of your wallet.',
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '💰 Import Private Key',
                      callback_data: 'import_pk',
                    },
                  ],
                ],
              },
            },
          );
          break;
      }

      if (action.includes('deposit_token-')) {
        const depositTokenContractAddress = action.split('deposit_token-')[1];
        const transactionRes = await this.getRecentTransactionWithParams({
          chatId: msg.chat.id,
        });

        const publicAddr = PKtoAddress(
          Buffer.from(transactionRes.walletPrivateKey, 'hex'),
        );

        const Wallet = new ethers.Wallet(
          transactionRes.walletPrivateKey,
          provider,
        );

        const depositTokenContractInteraction = new ethers.Contract(
          depositTokenContractAddress,
          ERC20_USDC_ABI,
          Wallet,
        );

        const tokenSymbol = await depositTokenContractInteraction.symbol();
        const userBalance = await depositTokenContractInteraction.balanceOf(
          publicAddr,
        );

        const tokenAmountPrompt = await bot.sendMessage(
          msg.chat.id,
          `Please enter the amount of ${tokenSymbol} to deposit.`,
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );

        bot.onReplyToMessage(
          msg.chat.id,
          tokenAmountPrompt.message_id,
          async (tokenAmountMsg) => {
            const tokenAmount = Number(tokenAmountMsg.text);

            if (tokenAmount <= 0 || isNaN(tokenAmount)) {
              options = {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: 'Back',
                        callback_data: 'deposit_token',
                      },
                      {
                        text: 'Cancel',
                        callback_data: 'back-to:start',
                      },
                    ],
                  ],
                },
              };
              bot.sendMessage(
                chatId,
                `Please enter a valid number to deposit.`,
                options,
              );
            } else {
              if (userBalance < tokenAmount) {
                options = {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: `Back`,
                          callback_data: 'deposit_token',
                        },
                      ],
                    ],
                  },
                };

                bot.sendMessage(
                  chatId,
                  `Please purchase ${tokenSymbol} and try again.`,
                  options,
                );
              } else {
                await this.updateTransaction({
                  chatId: msg.chat.id,
                  tokenSymbol: tokenSymbol,
                  tokenContractAddress: depositTokenContractAddress,
                  depositAmount: tokenAmount,
                });

                const contractInteraction = new ethers.Contract(
                  vaultContractAddress,
                  ERC20_Vault_ABI,
                  Wallet,
                );

                const allAllowedBrokers =
                  await contractInteraction.getAllAllowedBroker();

                allAllowedBrokers.forEach((broker, index) => {
                  const shortIdentifier = generateShortIdentifier(index);
                  valuesMap[shortIdentifier] = broker;
                });

                const borkersArray = allAllowedBrokers.map((broker, index) => [
                  {
                    text: `${broker}`,
                    callback_data: `get_broker_deposit-${generateShortIdentifier(
                      index,
                    )}`,
                  },
                ]);

                options = {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: borkersArray,
                    force_reply: true,
                  },
                };

                bot.sendMessage(
                  chatId,
                  'Please choose an allowed broker to deposit.',
                  options,
                );
              }
            }
          },
        );
      }

      if (action.includes('withdraw_token-')) {
        const withdrawTokenContractAddress = action.split('withdraw_token-')[1];
        const transactionRes = await this.getRecentTransactionWithParams({
          chatId: msg.chat.id,
        });

        const provider = new ethers.providers.JsonRpcProvider(
          convertEnumToChain(ChainStatus.Arbitrum),
        );

        const Wallet = new ethers.Wallet(
          transactionRes.walletPrivateKey,
          provider,
        );

        const tokenContractInteraction = new ethers.Contract(
          withdrawTokenContractAddress,
          ERC20_USDC_ABI,
          Wallet,
        );

        const tokenSymbol = await tokenContractInteraction.symbol();

        const tokenAmountPrompt = await bot.sendMessage(
          msg.chat.id,
          `Please enter the amount of ${tokenSymbol} to withdraw.`,
          {
            reply_markup: {
              force_reply: true,
            },
          },
        );

        bot.onReplyToMessage(
          msg.chat.id,
          tokenAmountPrompt.message_id,
          async (tokenAmountMsg) => {
            const tokenAmount = Number(tokenAmountMsg.text);

            if (tokenAmount <= 0) {
              options = {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: 'Back',
                        callback_data: 'withdraw_token',
                      },
                      {
                        text: 'Cancel',
                        callback_data: 'back-to:start',
                      },
                    ],
                  ],
                },
              };
              bot.sendMessage(
                chatId,
                'Please enter a valid number to withdraw.',
                options,
              );
            } else {
              await this.updateTransaction({
                chatId: msg.chat.id,
                tokenSymbol: tokenSymbol,
                tokenContractAddress: withdrawTokenContractAddress,
                withdrawAmount: tokenAmount,
              });

              const contractInteraction = new ethers.Contract(
                vaultContractAddress,
                ERC20_Vault_ABI,
                Wallet,
              );

              const allAllowedBrokers =
                await contractInteraction.getAllAllowedBroker();

              allAllowedBrokers.forEach((broker, index) => {
                const shortIdentifier = generateShortIdentifier(index);
                valuesMap[shortIdentifier] = broker;
              });

              const borkersArray = allAllowedBrokers.map((broker, index) => [
                {
                  text: `${broker}`,
                  callback_data: `get_broker_withdraw-${generateShortIdentifier(
                    index,
                  )}`,
                },
              ]);

              options = {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: borkersArray,
                  force_reply: true,
                },
              };

              bot.sendMessage(
                chatId,
                'Please choose an allowed broker to withdraw.',
                options,
              );
            }
          },
        );
      }

      if (action.includes('get_broker_deposit-')) {
        const shortIdentifier = action.split('get_broker_deposit-')[1];
        const brokerId = valuesMap[shortIdentifier];

        try {
          await this.updateTransaction({
            chatId: msg.chat.id,
            brokerId: brokerId,
          });

          const depositTransactionRes =
            await this.getRecentTransactionWithParams({
              chatId: msg.chat.id,
            });

          const provider = new ethers.providers.JsonRpcProvider(
            convertEnumToChain(ChainStatus.Arbitrum),
          );

          const Wallet = new ethers.Wallet(
            depositTransactionRes.walletPrivateKey,
            provider,
          );

          const contractInteraction = new ethers.Contract(
            vaultContractAddress,
            ERC20_Vault_ABI,
            Wallet,
          );

          const brokerHash = await ethers.utils.keccak256(
            depositTransactionRes.brokerId,
          );

          const tokenHash = await ethers.utils.keccak256(
            depositTransactionRes.tokenContractAddress,
          );

          const publicAddr = PKtoAddress(
            Buffer.from(depositTransactionRes.walletPrivateKey, 'hex'),
          );

          const encodedData = await ethers.utils.solidityPack(
            ['address', 'address'],
            [brokerHash, publicAddr],
          );

          const accountId = await ethers.utils.keccak256(encodedData);

          const tokenAmount = await ethers.utils.parseEther(
            depositTransactionRes.depositAmount.toString(),
          );

          await contractInteraction.deposit([
            accountId,
            brokerHash,
            tokenHash,
            tokenAmount,
          ]);

          await this.updateTransactionWithParams(
            {
              chatId: msg.chat.id,
              walletPrivateKey: depositTransactionRes.walletPrivateKey,
              brokerId: brokerId,
              depositAmount: depositTransactionRes.depositAmount,
            },
            { chatId: msg.chat.id, brokerId: brokerId, isVerified: true },
          );

          options = {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `Deposit`,
                    callback_data: `deposit_token`,
                  },
                ],
                [
                  {
                    text: 'Withdraw',
                    callback_data: `withdraw_token`,
                  },
                ],
              ],
              force_reply: true,
            },
          };
          bot.sendMessage(
            chatId,
            `You have successfully deposited ${depositTransactionRes.tokenAmount} ${depositTransactionRes.tokenSymbol}.`,
            options,
          );
        } catch (error) {
          console.log('Error depositing token ==>', error);
        }
      }

      if (action.includes('get_broker_withdraw-')) {
        const shortIdentifier = action.split('get_broker_withdraw-')[1];
        const brokerId = valuesMap[shortIdentifier];

        try {
          await this.updateTransaction({
            chatId: msg.chat.id,
            brokerId: brokerId,
          });

          const withdrawTransactionRes =
            await this.getRecentTransactionWithParams({
              chatId: msg.chat.id,
            });

          const provider = new ethers.providers.JsonRpcProvider(
            convertEnumToChain(ChainStatus.Arbitrum),
          );

          const Wallet = new ethers.Wallet(
            withdrawTransactionRes.walletPrivateKey,
            provider,
          );

          const contractInteraction = new ethers.Contract(
            vaultContractAddress,
            ERC20_Vault_ABI,
            Wallet,
          );

          const brokerHash = await ethers.utils.keccak256(
            withdrawTransactionRes.brokerId,
          );

          const tokenHash = await ethers.utils.keccak256(
            withdrawTransactionRes.tokenContractAddress,
          );

          const publicAddr = PKtoAddress(
            Buffer.from(withdrawTransactionRes.walletPrivateKey, 'hex'),
          );

          const encodedData = await ethers.utils.solidityPack(
            ['address', 'address'],
            [brokerHash, publicAddr],
          );
          const accountId = await ethers.utils.keccak256(encodedData);

          const tokenAmount = await ethers.utils.parseEther(
            withdrawTransactionRes.withdrawAmount.toString(),
          );

          const fee = await ethers.utils.parseEther(
            (withdrawTransactionRes.withdrawAmount / 100).toString(),
          );

          await contractInteraction.withdraw([
            accountId,
            brokerHash,
            tokenHash,
            tokenAmount,
            fee,
            vaultContractAddress,
            publicAddr,
            generateNonce(),
          ]);

          await this.updateTransactionWithParams(
            {
              chatId: msg.chat.id,
              walletPrivateKey: withdrawTransactionRes.walletPrivateKey,
              brokerId: brokerId,
              withdrawAmount: withdrawTransactionRes.withdrawAmount,
            },
            { chatId: msg.chat.id, brokerId: brokerId, isVerified: true },
          );

          options = {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `Deposit`,
                    callback_data: `deposit_token`,
                  },
                ],
                [
                  {
                    text: 'Withdraw',
                    callback_data: `withdraw_token`,
                  },
                ],
              ],
              force_reply: true,
            },
          };
          bot.sendMessage(
            chatId,
            `You have successfully withdrawed ${withdrawTransactionRes.tokenAmount} ${withdrawTransactionRes.tokenSymbol}.`,
            options,
          );
        } catch (error) {
          console.log('Error withdrawing token ==>', error);
        }
      }

      if (action.includes('back-to:start')) {
        const options = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '💰 Import Private Key',
                  callback_data: 'import_pk',
                },
              ],
            ],
          },
        };

        bot.sendMessage(
          chatId,
          '👋 Welcome to the Leverage Trading Bot! 👋 \n Please enter the private key of your wallet.',
          options,
        );
      }
    });
  }

  /**
   *
   * MongoDB related functions
   *
   */

  async createTransaction(createData: ITransaction) {
    try {
      const newTransaction = new this.TransactionModel(createData);
      console.log('Transaction created successfully:', newTransaction);
      return await newTransaction.save();
    } catch (error) {
      console.error('Error creating transaction:', error);
    }
  }

  async getRecentTransactionWithParams(matchData: ITransaction) {
    const { chatId } = matchData;
    try {
      const recentTransaction = await this.TransactionModel.findOne({ chatId })
        .sort({ timestamp: -1 })
        .exec();
      console.log(
        'Recent transaction retrieved successfully:',
        recentTransaction,
      );
      return recentTransaction;
    } catch (error) {
      console.error('Error retrieving last transaction:', error);
    }
  }

  async updateTransaction(updatedData: ITransaction) {
    const { chatId } = updatedData;
    try {
      const updateTransaction = await this.TransactionModel.findOneAndUpdate(
        { chatId },
        updatedData,
      )
        .sort({ timestamp: -1 })
        .exec();

      console.log('Transaction updated successfully:', updateTransaction);
      return updateTransaction;
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
  }

  async updateTransactionWithParams(
    matchParams: IMatchParams,
    updatedData: ITransaction,
  ) {
    try {
      const result = await this.TransactionModel.findOne({
        ...matchParams,
      });
      if (result) {
        return await this.TransactionModel.findOneAndUpdate(
          {
            ...matchParams,
          },
          updatedData,
          { new: true },
        );
      } else {
        const newTransaction = new this.TransactionModel(updatedData);
        return await newTransaction.save();
      }
    } catch (error) {
      console.log(error);
    }
  }
}
