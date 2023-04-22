const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  extractNumber,
  scroll,
  parseCompanyName,
  readToArray,
  writeTextToFile,
  writeArrayToFile
} = require('./utils')

let chrome = require('selenium-webdriver/chrome');
let { Builder, By, until } = require('selenium-webdriver');

/* ***** Notes *****
  1. Program both cheerio and selenium
    a. Cheerio is easier to use, doesn't work on SPAs
    b. Selenium is more complex, but offers some great benefits
  2. Use cheerio for static pages. It's so easy!
  3. Use selenium for SPAs or pages that lazy load or hydrate
  4. Goals?
    a. Set it up so main() calls the list scraping function
        then saves the data to a js file
    b. make the scraping functions custom to each site, but
        output always the same

*/



/* ############# Application Sources ############# */


const FORTUNE_2023 = "https://fortune.com/ranking/best-companies/2023/search";
const STILL_HIRING = "https://airtable.com/embed/shrI8dno1rMGKZM8y/tblKU0jQiyIX182uU?backgroundColor=cyan&viewControls=on";


/* ############# Data Stores ############# */


/** List of keywords to search for if page is valid */
const KEY_WORDs = ['engineer', 'developer', 'Engineer', 'Developer'];

/** List of companies to search for */
const SEARCH_LIST = [];

/** List of companies hiring thru common job board*/
const FOUND_LIST = [];

/** List of companies that require google search */
const NOT_FOUND_LIST = [];

/** An array of job board objects.
 *    notes:
 *      - workday has multiple APIs with non-standard urls
 *      - Other boards to consider, AngelList, WellFound, LinkedIn
 */
const jobBoards = [
  {
    name: 'greenhouse',
    url: (company) => `https://boards.greenhouse.io/${company}`,
    notFound: "Sorry, but we can't find that page.",
  }
  , {
    name: 'lever',
    url: (company) => `https://jobs.lever.co/${company}`,
    notFound: "Sorry, we couldn't find anything here"
  }
  , {
    name: 'indeed',
    url: (company) => `https://www.indeed.com/cmp/${company}/jobs`,
    notFound: "Page not found.",
  }
  , {
    name: 'workable',
    url: (company) => `https://apply.workable.com/${company}`,
    notFound: "Page not found.",
  }, {
    name: 'ashby',
    url: (company) => `https://jobs.ashbyhq.com/${company}`,
    notFound: "Page not found",
  }
];


/* ############# Scraping Functions ############# */


/** Uses Selenium headless browser to scrape company name data from airtable. */
async function scrapeStillHiring() {
  let companyNames = new Set();
  let elements;

  // .headless() to hide browser
  let driver = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options()
      .windowSize({ width: 900, height: 900 }))
    .build();

  try {
    // Get page, wait 5 seconds for data to load
    await driver.get(STILL_HIRING);
    await driver.wait(until.titleIs("Airtable - StillHiring.today - WHO THE FRIGGIN' FRIG IS HIRING RN?!"), 5000);

    let selectionCount = await driver.findElement(By.className('selectionCount')).getText();
    // let recordCount = extractNumber(selectionCount) || 0; //1400 is the row count as of 4/21

    // Adds currently viewed company names, scrolls down & waits 1.5 sec for more to load, repeat
    while (companyNames.size <= 1400) {

      await driver.manage().logs().get('browser')
        .forEach(log => console.log(`[${log.level}] ${log.message}`));

      driver.wait(until.elementsLocated(By.css('[data-columnid="fldekrsjTIcqFNlgA"]')), 2000);
      elements = await driver.findElements(By.css('[data-columnid="fldekrsjTIcqFNlgA"] > div > div'));

      for (let element of elements) {
        const name = await element.getText() || "";
        companyNames.add(name);
      }

      await driver.executeScript(scroll);
      await driver.sleep(1373);
    }

    // use companyNames set to dedupe, then store for main()
    for (let name of companyNames) {
      let parsedName = parseCompanyName(name)
      SEARCH_LIST.push(parsedName);
    }
    // save to file for posterity :)
    writeTextToFile(SEARCH_LIST, 'results/Still-Hiring-4-21-23.txt');

  } catch (e) {
    console.error(e);
  } finally {
    driver.quit();
  }
}

async function main() {
  // try {
  //   await scrapeStillHiring();
  // } catch (e) {
  //   console.error(e);
  // }
  let SEARCH_LIST = readToArray('results/Still-Hiring-4-21-23.txt');
  console.log(SEARCH_LIST);

  // Initieate Selenium Chrome driver
  let driver = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options()
      .headless()
      .windowSize({ width: 640, height: 480 }))
    .build();

  for (let company of SEARCH_LIST) {
    let count = 0;
    for (let jobBoard of jobBoards) {
      const url = jobBoard.url(company);

      try {
        await driver.get(url);
        await driver.show();
        await driver.manage().logs().get('browser')
          .forEach(log => console.log(`[${log.level}] ${log.message}`));
        await driver.sleep(200);

        // make this better
        const roleMatches = await driver.findElements(By.xpath(`//*[contains(text(), 'Engineer') or contains(text(), 'Developer')]`));
        // Set break conditions for cases to ignore...

        if (roleMatches.length) {
          FOUND_LIST.push(url);
          count++;
          console.log(`Success - ${company}: ${url} `);
        }

      } catch {
        console.error(`### Error - ${company}: ${url} ###`);
      }
    }
    // if we checked each job board with no success, add to unresolved
    if (count === 0) {
      NOT_FOUND_LIST.push(company);
      console.log(`Unresolved - ${company}`);
    }
  }
  /* ****** Save Data Locally ****** */
  writeArrayToFile(FOUND_LIST, 'companies.js'); // for index.html
  writeTextToFile(FOUND_LIST, 'results/hiring.txt');
  writeTextToFile(NOT_FOUND_LIST, 'results/unresolved.txt');

  if (FOUND_LIST.length && SEARCH_LIST.length) {
    console.log('Mission Accomplished.');
  } else {
    console.log('Completed with errors.');
  }
}


// main();
scrapeStillHiring()

/** Currently blocked by Fortune Paywall */
async function scrapeFortuneList() {
  try {
    const response = await axios.get(FORTUNE_2023);

    const $ = cheerio.load(response.data);
    const tableRows = $('table tr');
    // get the text of the 2nd td
    tableRows.each((i, element) => {
      const secondCell = $(element).find('td:nth-child(2)');
      console.log(secondCell.text());
      let company = secondCell.text();
      SEARCH_LIST.push(company.split(" ").join(""));
    });
  } catch (error) {
    console.error(error);
  }

  writeTextToFile(SEARCH_LIST, 'fortune-2023.txt');
}

