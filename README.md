# config-repo

Repositorio inicial del Sprint 2 de LogiTrack. **Todavía no implementa el servicio ni contiene configuración productiva.**

[Tablero del Sprint 2](https://github.com/orgs/Logitrack-Sa/projects/2) · [Contratos y puertos](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/CONTRATOS.md) · [Workflow](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/WORKFLOW.md)

Las issues del repositorio definen responsable, puntos, criterios y pruebas independientes. Usar fixtures y dobles para avanzar sin esperar servicios de otros integrantes. Se conserva el Sprint 1 en shipment-service.

Base actual: README, plantilla de PR, formulario de issues y revisor IA en GitHub Actions. No se agregan clases Java, POM, migraciones, Dockerfiles ni propiedades de aplicación hasta iniciar las issues.

La IA devuelve hallazgos sobre PR y sugerencias de pruebas; no planifica, no aprueba ni integra. CI de esta base verifica automatización. Las pruebas Maven y Docker se agregan en sus issues cuando exista la aplicación.

No incorporar credenciales, claves JWT privadas ni archivos .env. Java25 para aplicaciones; config-repo es únicamente Git de propiedades no sensibles dev/prod.

## Estructura de Archivos e Implementación

Este repositorio contiene las propiedades externalizadas por servicio y ambiente (`dev`/`prod`):

* `shipment-service.properties` (Configuración base)
* `shipment-service-dev.properties` (Desarrollo / Docker Compose)
* `shipment-service-prod.properties` (Producción)
* `courier-service.properties` (Configuración base)
* `courier-service-dev.properties` (Desarrollo / Docker Compose)
* `courier-service-prod.properties` (Producción)
* `security-service.properties` (Configuración base)
* `security-service-dev.properties` (Desarrollo / Docker Compose)
* `security-service-prod.properties` (Producción)

---

## Contrato de Variables y Placeholders

Externalizar puertos, nombres de aplicación, bases de datos MySQL, URLs internas, logging y seguridad no sensible.

### Reglas del Contrato:
1. **Cero Secretos en Git:** Las credenciales de base de datos (`${DB_USER}`, `${DB_PASSWORD}`), clave privada JWT y cuentas administrativas se reciben estrictamente por entorno o montajes en los contenedores, nunca como valores reales en Git.
2. **Nombres DNS de Compose:** En los perfiles `dev`, las conexiones entre contenedores y bases de datos utilizan nombres de red de Docker Compose (ej: `shipment-db`, `courier-db`, `security-db`) **nunca `localhost` intercontenedor**.
3. **Perfiles Dinámicos:** En producción (`prod`), los hosts, puertos y parámetros de infraestructura se inyectan de forma completamente dinámica mediante variables de entorno del sistema operativo u orquestador.