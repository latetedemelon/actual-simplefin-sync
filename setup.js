const inquirer = require('inquirer')
const simpleFIN = require('./simpleFIN')
const api = require('@actual-app/api');
const fs = require('fs');

// Path for the log file
const logFilePath = 'setup.log';

const logLevels = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error'
};

function log(level, message) {
  const logMessage = `[${new Date().toISOString()}] [${level.toUpperCase()}]: ${message}\n`;
  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error(`Failed to write to log: ${err}`);
    }
  });
}

let _token
let _accessKey
let _budgetId
let _budgetEncryption
let _serverUrl
let _serverPassword
let _sendNotes

console.log('Inquirer, SimpleFIN and API modules loaded.');

const prompts = [
  {
    type: 'input',
    name: 'token',
    message: 'Enter your SimpleFIN Token (https://beta-bridge.simplefin.org/):',
    default: () => getToken(),
    validate: async (input, answers) => {
      log(`Validating token: ${input}`);
      if (input !== getToken()) {
        try {
          log(`[SETUP] Calling getAccessKey with token: ${input}`);
          answers.accessKey = await simpleFIN.getAccessKey(input);
          log(`Retrieved access key: ${answers.accessKey}`);
        } catch (e) {
          console.error(`Invalid Token: ${input}, Error: ${e.message}`);
          return `Invalid Token: ${input}`;
        }
      } else {
        answers.accessKey = await simpleFIN.getAccessKey(input);
        log(`Using existing access key: ${answers.accessKey}`);
      }
      return true;
    }
  },
  {
    type: 'input',
    name: 'accessKey',
    message: 'AccessKey from SimpleFIN (This should have been derived from the Token provided)',
    askAwnsered: false
  },
  {
    type: 'input',
    name: 'serverUrl',
    default: () => getServerUrl(),
    message: 'Enter your ActualBudget Server URL:',
  },
  {
    type: 'input',
    name: 'serverPassword',
    default: () => getServerPassword(),
    message: 'Enter your ActualBudget Server Password:',

  },
  {
    type: 'input',
    name: 'budgetId',
    default: () => getBudgetId(),
    message: 'Enter your ActualBudget Sync ID:'
  },
  {
    type: 'input',
    name: 'budgetEncryption',
    default: () => getBudgetEncryption(),
    message: 'Enter your ActualBudget Budget Encryption Password (leave blank if not encrypted):'
  },
  {
    type: 'input',
    name: 'sendNotes',
    default: () => getSendNotes(),
    message: 'Overwrite mapped account notes with date and balance from SimpleFin each run? (enter "yes" without quotes, to enable):'
  }
]

function getChoices (answers, accounts) {
  const ret = accounts.filter(f => !Object.values(answers).find(a => a === f.id)).map(a => {
    return {
      name: `${a.name} (${a.type})`,
      value: a.id,
      short: a.name
    }
  }).sort((a, b) => {
    const au = a.name.toUpperCase()
    const bu = b.name.toUpperCase()
    if (au > bu) return 1
    else if (au < bu) return -1
    return 0
  })
  ret.push({
    name: 'Skip',
    value: null,
    short: 'Skipped'
  })
  return ret
}

function getToken () {
  return _token
}

function getAccessKey () {
  return _accessKey
}

function getServerPassword () {
  return _serverPassword
}

function getServerUrl () {
  return _serverUrl
}

function getBudgetId () {
  return _budgetId
}

function getBudgetEncryption () {
  return _budgetEncryption
}

function getSendNotes () {
  return _sendNotes
}

async function initialSetup(token, accessKey, budgetId, budgetEncryption, serverUrl, serverPassword, sendNotes) {
  console.log('Initiating setup...');
  _token = token;
  _accessKey = accessKey;
  _budgetId = budgetId;
  _budgetEncryption = budgetEncryption;
  _serverUrl = serverUrl;
  _serverPassword = serverPassword;
  _sendNotes = sendNotes;
  console.log('Prompting user for input...');
  console.log('Current token and accessKey:', { token: _token, accessKey: _accessKey });
  const initialSetup = await inquirer.prompt(prompts);
  console.log('User input received: ', initialSetup);
  return initialSetup;
}

async function accountSetup(accessKey, actualInstance, linkedAccounts, reLinkAccounts) {
  console.log('Starting account setup...');
  const simpleFINAccounts = await simpleFIN.getAccounts(accessKey)
  console.log('SimpleFIN Accounts: ', simpleFINAccounts);
  const accounts = (await actualInstance.getAccounts()).filter(f => !!reLinkAccounts || !Object.values(linkedAccounts || {}).find(a => a === f.id))
  console.log('ActualBudget accounts: ', accounts);
  const accountLinkPrompts = simpleFINAccounts.accounts.filter(f => !!reLinkAccounts || !linkedAccounts[f.id]).map(s => {
    return {
      type: 'list',
      name: s.id,
      message: `Link ${s.org.name} - ${s.name} ($${s.balance}) with ActualBudget account:`,
      default: linkedAccounts[s.id],
      choices: (a) => { return getChoices(a, accounts) },
      when: (a) => { return getChoices(a, accounts).length > 1 }
    }
  })
  const accountLinks = await inquirer.prompt(accountLinkPrompts)
  
  await actualInstance.shutdown()
  
  Object.assign(linkedAccounts, accountLinks)
  const nullsRemoved = Object.fromEntries(Object.entries(linkedAccounts).filter(([_, v]) => v != null))
  return nullsRemoved
}

async function initialize(config = [], overwriteExistingConfig = true) {
  if (!_serverUrl || overwriteExistingConfig) {
    if(config.serverUrl) {
      _serverUrl = config.serverUrl;
      console.log('Updated Actual Config: serverUrl')
    } else {
      throw new Error('Actual Budget Error: serverUrl is required');
    }
  }
  if (!_serverPassword || overwriteExistingConfig) {
    if(config.serverPassword) {
      _serverPassword = config.serverPassword;
      console.log('Updated Actual Config: serverPassword')
    } else {
      throw new Error('Actual Budget Error: serverPassword is required');
    }
  }
  if (!_budgetId || overwriteExistingConfig) {
    if(config.budgetId) {
      _budgetId = config.budgetId;
      console.log('Updated Actual Config: budgetId')
    } else {
      throw new Error('Actual Budget Error: budgetId is required');
    }
  }
  if (!_budgetEncryption || overwriteExistingConfig) {
    _budgetEncryption = config.budgetEncryption
    console.log('Updated Actual Config: budgetEncryption')
  }

  if (!_sendNotes || overwriteExistingConfig) {
    _sendNotes = config.sendNotes
    console.log('Updated Actual Config: sendNotes')
  }

  console.log('Initializing Actual Budget...');

  const { mkdir } = require('fs').promises;

  budgetspath = __dirname+'/budgets'

  try {
    await mkdir(budgetspath);
  } catch (e) {}

  try {
    await api.init({
      dataDir: budgetspath,
      serverURL: actualConfig.serverUrl || _serverUrl,
      password: actualConfig.serverPassword || _serverPassword,
    });

    let id = actualConfig.budgetId || _budgetId;
    let budgetEncryption = actualConfig.budgetEncryption || _budgetEncryption;

    await api.downloadBudget(id,  {password: budgetEncryption});
  } catch (e) {
    throw new Error(`Actual Budget Error: ${e.message}`);
  }
  console.log('Actual Budget initialized.');
  return api;
}

console.log('Setup module loaded.');

module.exports = { initialSetup, accountSetup, initialize }
