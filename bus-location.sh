#!/bin/bash

curl 'https://ticketless-app.api.urbanthings.cloud/api/2/vehiclepositions?maxLatitude=90&maxLongitude=180&minLatitude=-90&minLongitude=-180' \
  -H 'Accept: application/vnd.ticketless.arrivalsList+json; version=3' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Accept-Encoding: gzip, deflate, br, zstd' \
  -H 'x-ut-app: travel.ticketless.app.guernsey;platform=web' \
  -H 'x-api-key: TIzVfvPTlb5bjo69rsOPbabDVhwwgSiLaV5MCiME' \
  -H 'Origin: https://buses.gg' \
  -H 'Referer: https://buses.gg/' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0' \
  --compressed \
  -o vehicle_positions.json
