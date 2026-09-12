export class AppError extends Error { constructor(message: string, public readonly code = 'APP_ERROR') { super(message); this.name = 'AppError'; } }
