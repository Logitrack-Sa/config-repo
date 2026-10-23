# config-repo

Repositorio inicial del Sprint 2 de LogiTrack. **Todavía no implementa el servicio ni contiene configuración productiva.**

[Tablero del Sprint 2](https://github.com/orgs/Logitrack-Sa/projects/2) · [Contratos y puertos](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/CONTRATOS.md) · [Workflow](https://github.com/Logitrack-Sa/shipment-service/blob/main/docs/sprint2/WORKFLOW.md)

Las issues del repositorio definen responsable, puntos, criterios y pruebas independientes. Usar fixtures y dobles para avanzar sin esperar servicios de otros integrantes. Se conserva el Sprint 1 en shipment-service.

Base actual: README, plantilla de PR, formulario de issues y revisor IA en GitHub Actions. No se agregan clases Java, POM, migraciones, Dockerfiles ni propiedades de aplicación hasta iniciar las issues.

La IA devuelve hallazgos sobre PR y sugerencias de pruebas; no planifica, no aprueba ni integra. CI de esta base verifica automatización. Las pruebas Maven y Docker se agregan en sus issues cuando exista la aplicación.

No incorporar credenciales, claves JWT privadas ni archivos .env. Java25 para aplicaciones; config-repo es únicamente Git de propiedades no sensibles dev/prod.

## Estructura a implementar

Este repositorio contendrá propiedades por servicio y ambiente dev/prod. La precedencia entre archivos comunes y específicos y los nombres exactos de variables se documentarán en su issue antes de integrar consumidores.

Externalizar puertos, nombres de aplicación, MySQL, URLs internas, logging y seguridad no sensible. Credenciales de base, clave privada JWT y cuentas administrativas se reciben por entorno o montajes, nunca como valores reales en Git. El bootstrap del cliente conserva el nombre necesario para localizar su configuración. No contiene aplicación Java ni requiere imagen Docker propia.
