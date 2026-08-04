# Resumen de calidad - Aeropuertos de Sudamérica

Fecha de compilación: **2026-08-04**

## Alcance

- Registros GeoJSON: **341**.
- Filas de la tabla operativa: **341**.
- GeoJSON: WGS84, geometría Point, coordenadas en orden longitud/latitud.
- CSV: UTF-8, separador coma, decimales con punto y sin separadores de miles.

## Cantidad de aeropuertos por país

| País | Aeropuertos |
|---|---:|
| Argentina | 45 |
| Bolivia | 16 |
| Brasil | 130 |
| Chile | 19 |
| Colombia | 50 |
| Ecuador | 15 |
| Guayana Francesa | 3 |
| Guyana | 4 |
| Paraguay | 3 |
| Perú | 25 |
| Surinam | 6 |
| Uruguay | 3 |
| Venezuela | 22 |

## Fuentes

- Registros con una AIP oficial localizada como referencia: **285 (83.6%)**.
- Registros con portal aeronáutico oficial, sin AIP abierta localizada en esta compilación: **56 (16.4%)**.
- Registros que además requieren fuente secundaria para coordenadas/infraestructura: **341 (100.0%)**.
- Registros basados exclusivamente en fuente secundaria sin referencia oficial del país: **0 (0.0%)**.

La métrica anterior no significa que todos los atributos hayan sido extraídos de la AIP: la fuente oficial se usa como referencia y la geometría, elevación y pista se completan desde OurAirports.

## Campos geográficos incompletos

| Campo | Registros incompletos | Porcentaje | Motivo principal |
|---|---:|---:|---|
| codigo_iata | 0 | 0.0% | Criterio de inclusión exige IATA; no deberían existir faltantes. |
| codigo_oaci | 0 | 0.0% | No todos los aeródromos con IATA tienen código OACI publicado en la fuente complementaria. |
| provincia_estado_departamento | 0 | 0.0% | Región administrativa ausente o sin correspondencia en regions.csv. |
| ciudad | 0 | 0.0% | Municipio/localidad no informado. |
| elevacion_m | 0 | 0.0% | Elevación no informada en el registro complementario. |
| longitud_pista_m | 6 | 1.8% | No se localizó una pista abierta con longitud válida. |
| entidad_operadora | 329 | 96.5% | La estructura de concesiones cambia y no existe un catálogo regional oficial homogéneo. |

## Cobertura de la tabla operativa

| Variable | Aeropuertos con dato | Cobertura |
|---|---:|---:|
| pasajeros_totales_anuales | 3 | 0.9% |
| pasajeros_nacionales | 3 | 0.9% |
| pasajeros_internacionales | 3 | 0.9% |
| operaciones_aeronaves_anuales | 2 | 0.6% |
| carga_toneladas_anuales | 2 | 0.6% |
| correo_toneladas_anuales | 0 | 0.0% |

En esta versión se incorporaron cifras completas verificadas directamente para los aeropuertos paraguayos ASU y AGT, y pasajeros para ENO, desde el informe anual 2025 de DINAC. Para el resto se conservó una fila de unión, pero los indicadores quedan vacíos cuando no se pudo descargar y verificar una tabla oficial anual homogénea por aeropuerto.

## Limitaciones críticas

1. La bandera de servicio regular proviene de OurAirports y puede tener rezagos frente a cambios de programación.
2. La AIP confirma infraestructura y datos aeronáuticos, pero no necesariamente la existencia de vuelos comerciales regulares actuales.
3. Los aeródromos exclusivamente militares y las pistas privadas estratégicas no fueron inventariados exhaustivamente.
4. El campo `tipo` es una clasificación regional conservadora; conviene revisarlo país por país para usos regulatorios.
5. Antes de publicación operativa, deben contrastarse AIP/NOTAM, registro nacional de aeródromos y programación comercial vigente.
