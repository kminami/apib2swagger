FORMAT: 1A

# Test API

# Data Structures

## `Person` (object)

- first_name (string, required)
- last_name (string, required)

## `Member` (object)

- uid (string, required)
- Include `Person`

# Group Members

## Member Registrations [/accounts/register]

### Submit Registration [POST /accounts/register]

- Request (application/json)
    - Attributes (Person)

- Response 201 (application/json)
    - Attributes (Member)
