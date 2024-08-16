const setup = require('./setup')
const sync = require('./sync')
const nconf = require('nconf')
const api = require('@actual-app/api');
const fsExtra = require('fs-extra');

const {
  initialize,
} = require("./setup.js");

const logLevels = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error'
};

function log(level, message) {
  console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}]: ${message}`);
}

// Define a constant for the command line argument name
const configFileArg = 'configFile';

// Setup nconf to use (in order): command-line arguments, environment variables
nconf.argv({
  [configFileArg]: {
    describe: 'Path to the configuration file',
    type: 'string'
  }
}).env();

// Retrieve the custom configuration file path using the constant
const customConfigPath = nconf.get(configFileArg);

// Use the custom config file if provided, otherwise default to './config.json'
const configFilePath = customConfigPath || './config.json';

// Load the configuration file specified by configFilePath
nconf.file({ file: configFilePath });

let actualInstance

async function run () {
  let token = nconf.get('simpleFIN:token')
  log(logLevels.DEBUG, `token: ${token}`)
  let accessKey = nconf.get('simpleFIN:accessKey')
  log(logLevels.DEBUG, `accessKey: ${accessKey}`)
  let budgetId = nconf.get('actual:budgetId')
  let budgetEncryption = nconf.get('actual:budgetEncryption') || ''
  let serverUrl = nconf.get('actual:serverUrl') || ''
  let serverPassword = nconf.get('actual:serverPassword') || ''
  let sendNotes = nconf.get('actual:sendNotes') || ''
  let serverValidated = nconf.get('actual:serverValidated') || ''
  let linkedAccounts = nconf.get('linkedAccounts') || []

  const setupRequired = !!nconf.get('setup') || !accessKey || !budgetId || !serverUrl || !serverPassword || !serverValidated
  const linkRequired = setupRequired || !!nconf.get('link') || !linkedAccounts

  if (setupRequired) {
    const initialSetup = await setup.initialSetup(token, accessKey, budgetId, budgetEncryption, serverUrl, serverPassword)

    token = initialSetup.token
    accessKey = initialSetup.accessKey
    budgetId = initialSetup.budgetId
    budgetEncryption = initialSetup.budgetEncryption
    serverUrl = initialSetup.serverUrl
    serverPassword = initialSetup.serverPassword
    sendNotes = initialSetup.sendNotes

    nconf.set('simpleFIN:token', token)
    nconf.set('simpleFIN:accessKey', accessKey)
    nconf.set('actual:budgetId', budgetId)
    nconf.set('actual:budgetEncryption', budgetEncryption)
    nconf.set('actual:serverUrl', serverUrl)
    nconf.set('actual:serverPassword', serverPassword)
    nconf.set('actual:sendNotes', sendNotes)

    await nconf.save()

    actualConfig = {
      budgetId: budgetId,
      budgetEncryption: budgetEncryption,
      serverUrl: serverUrl,
      serverPassword: serverPassword
    }

    if (!actualInstance) {
      actualInstance = await initialize(actualConfig);
    }


    console.log('Budget: ', budgetId);

    await actualInstance.downloadBudget(budgetId, {password: budgetEncryption});

    accounts = await actualInstance.getAccounts();

    if(accounts.length <= 0) {

      throw new Error('Be sure that your Actual Budget URL and Server are set correctly, that your Budget has at least one created Account. ');

    }

    nconf.set('actual:serverValidated', 'yes')

    await nconf.save()
   
  }

  if (linkRequired) {
    actualConfig = {
      budgetId: budgetId,
      budgetEncryption: budgetEncryption,
      serverUrl: serverUrl,
      serverPassword: serverPassword
    }

    if (!actualInstance) {
      actualInstance = await initialize(actualConfig);
    }

    linkedAccounts = await setup.accountSetup(accessKey, actualInstance, linkedAccounts, linkRequired)
    nconf.set('linkedAccounts', linkedAccounts)
    nconf.save()
  }

  if(actualInstance) {
    await actualInstance.shutdown()
  }

  const lastSync = nconf.get('lastSync')
  let startDate
  if (lastSync) {
    // Looking back an additional 5 days, this may not be necessary, just trying to make sure we catch any additional 'older' transactions that may have slipped in after our last check.
    startDate = new Date(lastSync)
    startDate.setDate(startDate.getDate() - 5)
  }

  budgetspath = __dirname+'/budgets'
  fsExtra.emptyDirSync(budgetspath);

  await sync.run(accessKey, budgetId, budgetEncryption, linkedAccounts, startDate, serverUrl, serverPassword, sendNotes)
  nconf.set('lastSync', new Date().toDateString())
  nconf.save()

  console.log('Clearing temporary budget files.')
  fsExtra.emptyDirSync(budgetspath);

  console.log('Complete')
  process.exit()

}

run()