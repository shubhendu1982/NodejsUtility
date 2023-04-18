import * as chalk from 'chalk'

class Logger {
  static debug(message: string) {
    const date = '[' + new Date().toISOString() + '] '
    console.log(date, chalk.cyan(message))
  }
  
  static info(message: string) {
    const date = '[' + new Date().toISOString() + '] '
    console.log(date, chalk.green(message))
  }
  
  static warn(message: string) {
    const date = '[' + new Date().toISOString() + '] '
    console.log(date, chalk.yellow(message))
  }
  
  static error(message: string) {
    const date = '[' + new Date().toISOString() + '] '
    console.log(date, chalk.red(message))
  }
}

export { Logger }
