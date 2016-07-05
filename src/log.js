import chalk from 'chalk';

const API = {
  info,
  warn,
  error,
};

export default API;

/**
 * log information message to console
 * @param  {string} infoMessage log information message
 * @return {undefined}
 */
function info(infoMessage) {
  console.info(chalk.bgBlue('[ℹ INFO] '), chalk.gray(`[${new Date()}]`), infoMessage);
}

/**
 * log warning message to console
 * @param  {string} warnMessage log warning message
 * @return {undefined}
 */
function warn(warnMessage) {
  console.warn(chalk.bgYellow('[⚠ WARN] '), chalk.gray(`[${new Date()}]`), warnMessage);
}
/**
 * log error message to console
 * @param  {string} errorMessage log error message
 * @return {undefined}
 */
function error(errorMessage) {
  console.error(chalk.bgRed('[💣 ERROR]'), chalk.gray(`[${new Date()}]`), errorMessage);
}
