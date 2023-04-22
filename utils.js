"use strict";

const fs = require('fs');

/* ############# Utils ############# */

/** For use on Airtable sites where number is in a string
 * Extracts all digits from a string as one number
*/
function extractNumber(string) {
  let num = '';
  for (let char of string) {
    if ('1234567890'.includes(char)) num += char;
  }
  return Number(num);
}

/** For use on the Airtable sites where default scroll behavior is blocked
 * Fires a wheel event on the paneContainer class. Discovered through trial and err
 */
function scroll({ deltaX, deltaY }) {
  document.getElementsByClassName('paneContainer')[0]
    .dispatchEvent(new WheelEvent('wheel', {
      deltaY: 900,
      deltaX: 0,
      cancelable: true
    }));
}

/** For cleaning company names to check against job board
 *
 * Attemppt to return simplest version of a compay name.
 * 'Bananas, Inc' --> 'bananas'
 */
function parseCompanyName(string) {
  let output = '';
  const valid = '1234567890qwertyuiopasdfghjklzxcvbnm';
  for (let char of string.toLowerCase()) {
    if (valid.includes(char)) output += char;
    else if (char === '.') output += '';
    else if (char === '&') output += '';
    else if (char === '-') output += '';
    else break;
  }
  return output;
}

function readToArray(path) {
  try {
    const data = fs.readFileSync(path, 'utf8');
    return data.split('\n').map(el => el.split(' ').join(''));
  } catch {
    console.error("Error reading from ", path);
    return [];
  }
}

function writeTextToFile(array, filePath) {
  const text = array.join('\n');
  fs.writeFile(filePath, text, (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
    } else {
      console.log(`Successfully wrote file: ${filePath}`);
    }
  });
}

function writeArrayToFile(arr, filename) {
  const content = `module.exports = [\n  "${arr.join('",\n  "')}"\n];`;

  fs.writeFile(filename, content, (err) => {
    if (err) throw err;
    console.log(`File ${filename} has been saved.`);
  });
}

module.exports = {
  extractNumber,
  scroll,
  parseCompanyName,
  readToArray,
  writeTextToFile,
  writeArrayToFile
};