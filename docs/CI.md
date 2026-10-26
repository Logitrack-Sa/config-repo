# CI independiente del Sprint 2 (#60)

La calidad del repositorio valida Markdown y estructura. Mientras no haya POM no se ejecutan ni se declaran pruebas Java. Los repositorios de aplicación ejecutan Maven verify con fixtures locales; security/courier disponen de MySQL efímero. Si existe Dockerfile y la suite pasa, se construye la imagen sin publicarla.

Las pruebas de aplicación usan perfil test y dobles propios de HTTP, JWT o Git. No se descarga la rama main de otra aplicación como dependencia de pruebas. El código de PR se ejecuta sin secretos y con permisos de solo lectura. La revisión IA es un workflow separado y no sustituye la revisión humana.

La integración global de cuatro imágenes publicadas se ejecuta manualmente desde shipment-service (#61). config-repo contiene propiedades Git y no compila una aplicación. La ausencia de un POM implica jobs Java omitidos, no una compilación aprobada.
