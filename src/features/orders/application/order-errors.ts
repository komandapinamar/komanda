export class OrderNotFoundError extends Error {}
export class OrderConflictError extends Error {}
export class OrderAlreadyPaidError extends Error {
  constructor(message = "La orden ya ha sido abonada y no puede ser cancelada.") {
    super(message);
    this.name = "OrderAlreadyPaidError";
  }
}
export class OrderValidationError extends Error {}
export class InvalidPickupPinError extends Error {
  constructor(message = "El PIN de retiro proporcionado es incorrecto.") {
    super(message);
    this.name = "InvalidPickupPinError";
  }
}

export class OrderingNotSupportedError extends Error {
  constructor(
    message = "El comercio opera en modo autoservicio presencial. Los pedidos web no están habilitados.",
  ) {
    super(message);
    this.name = "OrderingNotSupportedError";
  }
}

export class BusinessClosedError extends Error {
  constructor(
    message = "El restaurante no se encuentra aceptando pedidos en este horario.",
  ) {
    super(message);
    this.name = "BusinessClosedError";
  }
}

export class CashOrderCartUnavailableError extends Error {
  constructor(message = "El carrito no está disponible o ha expirado.") {
    super(message);
    this.name = "CashOrderCartUnavailableError";
  }
}

export class CartVersionMismatchError extends OrderConflictError {
  constructor(message = "CART_VERSION_MISMATCH: Cart version is stale.") {
    super(message);
    this.name = "CartVersionMismatchError";
  }
}

export class NoOpenCashShiftError extends Error {
  readonly code = "NO_OPEN_CASH_SHIFT";
  constructor(
    message = "No existe un turno de caja abierto para registrar el cobro.",
  ) {
    super(message);
    this.name = "NoOpenCashShiftError";
  }
}

export class ForbiddenRoleError extends Error {
  readonly code = "FORBIDDEN_ROLE";
  constructor(message = "Access is restricted to authorized roles.") {
    super(message);
    this.name = "ForbiddenRoleError";
  }
}


