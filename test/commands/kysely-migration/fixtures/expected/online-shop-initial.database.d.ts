// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: 2026-06-06T12:34:56.789Z
// payload: |
//   H4sIAAAAAAAAA+VUsW7bMBD9l5tpV8nQQVuRLEHmToUg0OTJYkSRKnksYhj694KSTNOOitZut266
//   E/We3uO7O4LkxDe+QxLtJ7nbDM6+oSBlzcYbPvjWEpTwsC22xUY63tC2AAbEdxo9lN+OoCSUIIIn
//   26MDBob3mHU8MBBWh95kx5U8H5ye6TAglMfUM4R7dDAyMEHrSAZlw7VHBhIbHjTF050yEc32iggl
//   jCNb8Iew00q8ZCxzp14jEy2P/63R7KmF8vHzvawTXmJcqiuyH9xd8T0Uxa2EFYNg1PeAT9Z4clwZ
//   ms1dSMJ7neyvc+Xni8gMqSJeYx2qvXnFQ3xbMVBG4jsuhWhRdJdkFYPBqZ67wyseMoFDV69fPUxU
//   ySzrZB6XqfyPsnLyKOc99VaZ/1amJ07Bn8lS/duAPt6czyTSISeUXyjTOLdqTh+pSfXoiffD3SLD
//   IK8Jl9Y/JvyDCZwTfdf4JZimO8FkCzZDyRNTMXDYoEMj4tge5x39y008jyMDa55RI8WDDj05JaJR
//   1nydfMu748VWOAczSU2Rymf4Mm5jFe/qw5dJx0U8VmBywRlS9tk4+XnbwlpZPsu2qsafD2dd3SEH
//   AAA=
// ---

export interface Database {
  "customers": {
    "id": number
    "public_id": string
    "name": string
  }
  "orders": {
    "id": number
    "public_id": string
    "customer_id": number
    "status": string
    "created_at": string
    "updated_at": string
  }
}
