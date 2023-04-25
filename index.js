const { exec } = require('child_process');
let chrome = require('selenium-webdriver/chrome');
let { Builder, By, until } = require('selenium-webdriver');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  scroll,
  extractNumber,
  parseCompanyName,
  writeTextToFile,
  writeArrayToFile
} = require('./utils');


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
async function scrapeStillHiring(driver) {
  let companyNames = new Set();
  let elements;

  try {
    await driver.get(STILL_HIRING);
    await driver.wait(until.titleIs("Airtable - StillHiring.today - WHO THE FRIGGIN' FRIG IS HIRING RN?!"), 5000);
    console.log("Airtable - StillHiring.today - WHO THE FRIGGIN' FRIG IS HIRING RN?!");

    // recordCount method below generally fails, see break condition below
    // let selectionCount = await driver.findElement(By.className('selectionCount')).getText();
    // let recordCount = extractNumber(selectionCount) || 1000; // 1400 is the row count as of 4/21
    let running = true;
    while (running) {
      // Airtable lazy loads so we get all visible company names, then scroll & rpt.
      driver.wait(until.elementsLocated(By.css('[data-columnid="fldekrsjTIcqFNlgA"]')), 2000);
      elements = await driver.findElements(By.css('[data-columnid="fldekrsjTIcqFNlgA"] > div > div'));

      for (let element of elements) {
        const name = await element.getText() || "";
        companyNames.add(name);
        console.log('Company: ', name);
        running = name === 'Pulsenics Inc' ? false : true
      }
      console.log('driver scroll y ', 850);
      await driver.executeScript(scroll);
      console.log('driver sleep: ', 300);
      await driver.sleep(300);
      console.log('companyNames Size: ', companyNames.size);
    }

    // use companyNames set to dedupe, then store for main()
    console.log('push cached nams to SEARCH_LIST');
    for (let name of companyNames) {
      let parsedName = parseCompanyName(name);
      SEARCH_LIST.push(parsedName);
    }
    // save to file for posterity :)
    console.log('SEARCH_LIST saved to ./results/Still-Hiring-4-21-23.txt');
    writeTextToFile(SEARCH_LIST, 'results/Still-Hiring-4-21-23.txt');

  } catch (e) {
    console.error(e);
  }
}

async function main() {
  // Initiate Selenium Chrome driver
  // .headless() to hide browser
  let driver = new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options()
      .windowSize({ width: 800, height: 900 }))
    .build();

  try {
    await scrapeStillHiring(driver);
  } catch (e) {
    console.error(e);
  }

  // Use when reading data from file
  // let SEARCH_LIST = readToArray('results/Still-Hiring-4-21-23.txt');

  for (let company of SEARCH_LIST) {
    let count = 0;
    for (let jobBoard of jobBoards) {
      const url = jobBoard.url(company);

      try {
        console.log('checking: ', url);
        await driver.get(url);
        await driver.sleep(200);
        // make this better
        const roleMatches = await driver.findElements(By.xpath(`//*[contains(text(), 'Engineer') or contains(text(), 'Developer')]`));

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
  console.log('** Writing data to files **');
  writeArrayToFile(FOUND_LIST, 'companies.js'); // for index.html
  console.log('FOUND_LIST saved to ./companies.js');
  writeTextToFile(FOUND_LIST, 'results/hiring.txt');
  console.log('FOUND_LIST saved to ./results/hiring.txt');
  writeTextToFile(NOT_FOUND_LIST, 'results/unresolved.txt');
  console.log('SEARCH_LIST saved to ./results/unresolved.txt');

  if (FOUND_LIST.length && SEARCH_LIST.length) {
    console.log('Mission Accomplished.');

  } else {
    console.log('Completed with errors.');
  }

  driver.quit();

  try {
    // only works for macos
    exec(`open "index.html"`)
  } catch {
    console.error("Failed to open index.html")
  }
}


main();
// scrapeStillHiring();

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

