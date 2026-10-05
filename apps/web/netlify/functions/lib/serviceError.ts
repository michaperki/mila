export class ServiceError extends Error {
  constructor(public code: string, message: string, public statusCode = 503) {
    super(message)
    this.name = 'ServiceError'
  }
}
