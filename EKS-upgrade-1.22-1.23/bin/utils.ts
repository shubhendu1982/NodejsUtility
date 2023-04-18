import { Exit } from './exit'
import { Logger } from './logger'
import * as readline from 'readline'
import * as cliProgress from 'cli-progress'
import { includes, isEmpty } from 'lodash'
import { question } from 'zx'
import which = require('which')

type ShouldRetryFunction = {
  (exception: Error, depth: number): boolean
}

class Utils {
  static async checkFunction(fn: Function, shouldRetry: ShouldRetryFunction = () => true) {
    try {
      return await this.callWithRetry(fn, 0, shouldRetry)
    } catch (error) {
      Logger.warn(`Function threw an exception: ${error}`)
      const answer = await question('Should we proceed [p], abort [a], or enter to check again? ', { choices: ['p', 'a', 'c'] })

      switch (answer) {
        case 'a':
          Exit.withWarning('Aborting...')
          break
        
        case 'p':
          Logger.debug('Proceeding...')
          break
      
        default:
          return await this.checkFunction(fn)
      }
    }
  }

  static async getEnv(
    envProperty: string,
    choices: string[],
    forceChoices: boolean = false
  ): Promise<string> {
    let envPropertyValue: string = process.env[envProperty.toUpperCase()]
    
    if (isEmpty(envPropertyValue)) {
      envPropertyValue = await question(`Choose ${envProperty}: `, { choices })
    }
  
    if (forceChoices) {
      if (!includes(choices, envPropertyValue)) {
        Exit.withError(`${envProperty} needs to be part of ${choices}`)
      }
    }
  
    return envPropertyValue
  }

  static async checkRequiredProgramsExist(programs: string[]): Promise<void> {
    try {
      for (let program of programs) {
        await which(program)
      }
    } catch (error) {
      Exit.withError(`Error: Required command ${error.message}`)
    }
  }

  private static async callWithRetry(fn: Function, depth = 0, shouldRetry: ShouldRetryFunction = () => true, maxDepth = 5) {
    try {
      return await fn()
  
    } catch(e) {
      if (depth > maxDepth || !shouldRetry(e, depth)) {
        throw e.message
      }
  
      const seconds = 2 ** depth

      Logger.warn(`Attempt #${depth}/${maxDepth} | Error message: "${e.message}" | Waiting ${seconds}s`)

      await this.sleepWithProgress(seconds)
  
      return await this.callWithRetry(fn, depth + 1, shouldRetry)
    }
  }

  static async sleepWithProgress(totalSleepTimeInSeconds = 2): Promise<void> {
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
    const intervalTimeMs = 1000
    const totalSleepMs = totalSleepTimeInSeconds * intervalTimeMs
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    Logger.info(`Sleeping for ${totalSleepMs/intervalTimeMs} seconds... Press enter to cancel the sleep and continue`)
    progressBar.start(totalSleepMs/intervalTimeMs, 0)
  
    return new Promise(async (resolve) => {
      let wasCanceled = false
  
      rl.question('', _ => {
        rl.close()
        progressBar.stop()
        wasCanceled = true
        return resolve()
      })
  
      for (let i = intervalTimeMs; i <= totalSleepMs; i += intervalTimeMs) {
        progressBar.update(i/1000)
        if (wasCanceled) {
          return resolve()
        }
        await this.wait(intervalTimeMs)
      }
  
      rl.close()
      progressBar.stop()
      
      return resolve()
    })
  }

  private static async wait(ms: number) {
    const promise = new Promise((res) => setTimeout(res, ms))
    return promise
  }
}

export { Utils }
