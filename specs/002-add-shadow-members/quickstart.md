# Quickstart Validation Guide: Add Shadow Members

This guide outlines how to validate the Shadow Member functionality end-to-end.

## Prerequisites
- The Komanda application must be running locally.
- A test tenant must be provisioned (e.g. using `npm run seed:tenant`).
- You must be logged in as the owner of the test tenant.

## Validation Scenarios

### Scenario 1: Invite a Non-Existent User

1. Navigate to the Members section in the application UI for your tenant.
2. Enter a brand-new email address (e.g., `shadow.test@example.com`).
3. Select "Employee" as the role and submit the form.
4. **Expected Outcome**: The UI should instantly display the new member in the list without any "User not found" errors.

### Scenario 2: Verify Shadow User in Database

1. Connect to the local PostgreSQL database:
   ```bash
   psql -U komanda_runtime -d komanda_test
   ```
2. Run the following query:
   ```sql
   SELECT id, email, password_hash, status FROM users WHERE email = 'shadow.test@example.com';
   ```
3. **Expected Outcome**: 
   - The user should exist.
   - `password_hash` should be exactly `!INVITED_USER!`.
   - `status` should be `pending_verification`.
4. Run the query to check the `identity_verification_challenges` table:
   ```sql
   SELECT user_id, token_digest FROM identity_verification_challenges WHERE user_id = (SELECT id FROM users WHERE email = 'shadow.test@example.com');
   ```
5. **Expected Outcome**: A challenge should exist for the shadow user.
6. Check your mail capture file (e.g. `.test-artifacts/verification.jsonl` if `IDENTITY_VERIFICATION_DELIVERY=capture`):
   - You should see an entry for `shadow.test@example.com` with a cleartext token.

### Scenario 3: Activating the Shadow User (Setting Password)

1. Find the `token` generated for the shadow user from the mail capture file (or DB query if logged).
2. Open your browser and navigate to the frontend route: `http://localhost:3000/accept-invitation?token=THE_EXTRACTED_TOKEN`
3. Enter a new password on the screen and submit.
4. **Expected Outcome**: You are redirected to log in (or auto-logged in), and the user's status in the database changes to `active` with a real bcrypt hash.

### Scenario 4: Invite an Existing User

1. Navigate to the Members section.
2. Enter an email address that already has an account in the system (but is not in this tenant).
3. Submit the form.
4. **Expected Outcome**: The user is added successfully, and their existing account is linked (no new shadow user is created).

### Scenario 5: Error on Duplicate Membership

1. Navigate to the Members section.
2. Enter the email address of a user who is *already* in the list.
3. Submit the form.
4. **Expected Outcome**: An error message is displayed (e.g., "User is already a member of this tenant").
