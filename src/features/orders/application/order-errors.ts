export class OrderNotFoundError extends Error {}
export class OrderConflictError extends Error {}
export class OrderValidationError extends Error {}
export class InvalidPickupPinError extends Error {
  constructor(message = "El PIN de retiro proporcionado es incorrecto.") {
    super(message);
    this.name = "InvalidPickupPinError";
  }
}

