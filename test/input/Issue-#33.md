FORMAT: 1A

# INT-1\_Plan\_v1\_dev

This API is a HTTP-1.1 REST service that provides plans

**Changelog**

| Date of change    | Description       |
| ----------------- | ----------------- |
| 03.08.2018        | Document creation |

# Group People

## Collection of Plans of People [/myapp/people/plans{?dateFrom,dateTo}]

### Get Plans of People [GET]

* Paginated &#10006;

* Sortable &#10006;

* Signable &#10006;

#### Error Codes

Possible error codes for this resource.

| HTTP Status Code  | Error Code        | Purpose   |
| ----------------- | ----------------- | --------- |
| 400               | VALIDATION\_ERROR | Validation error. |
| 400               | FIELD\_MISSING    | A required field is missing. |

+ Parameters
    + dateFrom: `2018-08-01` (string, optional) - Date from.
    + dateTo: `2018-08-30` (string, optional) - Date to.

+ Request

    + Headers

            some-key: <here comes some key>
            auth: <here comes some token>

+ Response 200 (application/json)

    + Attributes (object)
        + segments (array[SEGMENT_ENUM], required, fixed-type) - List of found segments
        + plans (array, required, fixed-type) - List of plans
            + (object)
                + state: COMPLETED (string, required) - State code
                + stateCounters (array, required, fixed-type) - List of states of plans by segment
                    + (object)
                        + segment (SEGMENT_ENUM, required) - segment code
                        + count: 5 (number, required) - number of plans

# Data Structures

## `SEGMENT_ENUM` (enum)

+ LOW
+ MIDDLE
+ HIGH
