# config-repo

Propiedades de los tres clientes del Sprint 2. Continúa la entrega de Damián fusionada en PR #4, issue #1: alinea nombres con el código de shipment y conserva puertos en dev/prod. Este repositorio no es una aplicación ni contiene secretos.

## Organización y precedencia

Cada servicio tiene un archivo base SERVICE.properties y dos overrides SERVICE-dev.properties / SERVICE-prod.properties. El override del perfil prevalece sobre la base. Config Server sirve /SERVICE/PROFILE/main con su versión Git. config-server.properties conserva solo el puerto de referencia: el servidor arranca con su propio bootstrap local y no depende de sí mismo.

| Cliente | Puerto inicial en dev y prod | MySQL DNS en dev |
|---|---|---|
| shipment-service | 8081 | shipment-db:3306/shipment_db |
| courier-service | 8082 | courier-db:3306/courier_db |
| security-service | 8083 | security-db:3306/security_db |

SERVER_PORT permite sobreescribir cada puerto; coordinar cualquier cambio con las URLs de los consumidores. Los nombres DNS son internos de Compose. Desde el host usar los puertos publicados; localhost nunca identifica otro contenedor.

## Variables del entorno de cada cliente

| Variable | Uso |
|---|---|
| DB_URL | URL JDBC propia; obligatoria en prod, override del DNS por defecto en dev |
| DB_USERNAME, DB_PASSWORD | Cuenta de aplicación y contraseña obligatorias; no root |
| COURIER_SERVICE_URL | Solo shipment; en dev http://courier-service:8082, obligatoria en prod |
| COURIER_CONNECT_TIMEOUT, COURIER_READ_TIMEOUT | Solo shipment; 2s y 3s por defecto |
| FEE_BASE, FEE_PRICE_PER_KG, FEE_VOLUMETRIC_DIVISOR | Tarifas shipment; obligatorias en prod, valores públicos de prueba en dev |
| JWT_PUBLIC_KEY_LOCATION, JWT_KEY_ID, JWT_ISSUER, JWT_AUDIENCE | Contrato de verificación local; clave pública montada, ID y emisor/audiencia acordados |
| JWT_PRIVATE_KEY_LOCATION | Solo emisor security; ruta al montaje privado, nunca PEM en Git |
| JWT_TTL | Solo emisor security; duración ISO-8601, PT15M inicial en dev y obligatoria en prod |
| SERVER_PORT | Opcional; puerto HTTP de cada aplicación |

DB_USERNAME es el nombre del contrato distribuido; DB_USER pertenece al arranque histórico del Sprint 1. Las propiedades exactas del cliente shipment son logitrack.courier.base-url y logitrack.security.*; no usar logitrack.courier-service.url.

Los placeholders se resuelven en el entorno del **cliente**, no deben reemplazarse por secretos en Git o en Config Server. JWT de courier/security es contrato reservado para sus issues; disponer del archivo no significa que esa funcionalidad ya exista.

Cada cliente mantiene bootstrap mínimo local: spring.application.name, SPRING_PROFILES_ACTIVE=dev o prod e import configserver:${CONFIG_SERVER_URL}. Config Client es obligatorio en esos perfiles cuando se integre su issue. Config Server no necesita credenciales de bases de los clientes. En prod DB_URL debe incluir TLS y parámetros adecuados a su infraestructura; aquí no se fuerza useSSL=false.

## Verificar

`python -m unittest discover -s tests -v` valida las seis combinaciones, nombres consumidos, precedencia, puertos, DNS y ausencia de valores secretos o defaults de credenciales. GitHub Actions ejecuta lo mismo sin secretos ni permisos de escritura. La prueba del Config Server usa Git temporal independiente; estas propiedades no prueban una integración distribuida completa.

[Contratos](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/CONTRATOS-V1.md) · [Tablero](https://github.com/orgs/Logitrack-Sa/projects/2).
