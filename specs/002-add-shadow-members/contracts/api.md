# Contract: Members API

## `POST /api/v1/tenants/[tenantId]/members`

Adds a new member to a tenant. If the user does not exist, a shadow user is created automatically.

**Request Body**:
```json
{
  "email": "string (email format)",
  "role": "owner | admin | employee"
}
```

**Responses**:

- **`201 Created`**:
  ```json
  {
    "id": "uuid (membership id)",
    "email": "string",
    "role": "owner | admin | employee",
    "status": "active | revoked",
    "createdAt": "iso8601 string"
  }
  ```
  *(Note: Even for shadow users, the membership status will be `active`, while the underlying user status is `pending_verification`)*

- **`400 Bad Request`**: (e.g. Validation error, or "User is already a member of this tenant")
