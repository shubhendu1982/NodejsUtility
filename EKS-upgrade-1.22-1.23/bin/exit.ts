import { Logger } from './logger'

class Exit {
  static withWarning(message: string) {
    Logger.warn(message)
    process.exit(1)
  }

  static withError(message: string) {
    Logger.error(message)
    process.exit(1)
  }
}

export { Exit }
