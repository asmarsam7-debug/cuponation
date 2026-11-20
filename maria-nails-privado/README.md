# María Nails · propuesta privada de El Rosario

Implementación preparada; NO desplegada ni conectada al dominio. La instalación permanece deshabilitada (`ENABLED=false`) y falla cerrada sin configuración completa. El portal es independiente de cupo-nation.com, aunque su código vive en el mismo repositorio. No cambiar el CNAME existente de GitHub Pages.

## Experiencia

Invitación individual vinculada a un correo → código por email → nombre completo y lectura del NDA bilateral → casilla sin premarcar y aceptación expresa → copia del acuerdo por email → propuesta privada. Aviso destacado en cada apertura y marca de agua con nombre/correo. No hay contraseña compartida, PDF público ni datos comerciales en los archivos estáticos. La propuesta visual comprende 8 páginas, accesibles solo después de aceptar. La marca de agua y los avisos disuaden; no impiden capturas ni copias de un visitante autorizado.

## Activación pendiente

1. Confirmar correo de notificaciones y remitente, domicilio/correo del aviso de privacidad y contenido definitivo del acuerdo. María del Rocío López Lozano asume personalmente obligaciones recíprocas al habilitarlo. Si se desea obligar a otros titulares o una sociedad, se deben identificar y acreditar sus facultades antes de activar.
2. Conectar una cuenta Cloudflare a este repositorio, carpeta `maria-nails-privado`; crear D1 y un bucket R2 PRIVADO (sin r2.dev ni dominio público). Aplicar `schema.sql` y sustituir el ID D1 de `wrangler.jsonc`. No agregar secretos al repositorio.
3. Configurar secretos `RESEND_API_KEY`, `OTP_PEPPER` (aleatorio de al menos 32 bytes), `MAIL_FROM`, `OWNER_EMAIL`, `PRIVACY_EMAIL`, `PRIVACY_ADDRESS`. Verificar en Resend el dominio remitente y sus registros DNS. No usar un proveedor de email de pruebas para visitantes reales.
4. Subir las ocho páginas WebP de la presentación final a las claves R2 `proposal/page-1.webp` ... `proposal/page-8.webp`, mediante acceso administrativo. No subirlas a GitHub. Las imágenes están preparadas localmente y excluidas del control de versiones.
5. Revisar el acuerdo y aviso completos, correr `node --test worker.test.mjs` con Node 22.13+ y probar end-to-end correo real, móvil y revocación en un entorno de prueba. Los tests actuales usan correo y almacenamiento simulados; no certifican envío real ni despliegue Cloudflare.
6. Desplegar el Worker y asociar `themarianails.com` como dominio personalizado. Wix seguirá siendo el registrador si se conserva así. Configurar zona DNS/delegación según indique Cloudflare; conservar previamente todos los registros de correo y otros servicios. No cambiar cupo-nation.com. El registro CNAME del repositorio actual permanece intacto.
7. Solo después de verificar las dependencias, poner `ENABLED=true`, generar invitaciones y compartir enlaces personales. El origen configurado debe coincidir exactamente con el dominio HTTPS de producción.

## Invitaciones y administración

`node invite.mjs correo@ejemplo.com` produce un enlace con token aleatorio y la sentencia/valores para insertar la invitación en D1 con una herramienta administrativa. No pegar tokens ni correos de compradores en commits, issues o logs públicos. Caducidad predeterminada 30 días. Revocar con `UPDATE invites SET revoked=1 WHERE id_hash=?`; la comprobación afecta inmediatamente a sesiones y contenido. El token va en el fragmento de URL para no registrarse como ruta del servidor.

D1 conserva instantáneas del texto aceptado, huella SHA-256, nombre, correo verificado, folio, hora del servidor, IP y navegador. Las instantáneas rechazan cambios ordinarios y borrado con triggers; esto no es una constancia certificada, no protege contra un administrador con control total de la base y requiere respaldos y controles de acceso. Exportar evidencia por canal privado. Los IDs de correo registran envío aceptado por el proveedor, no entrega garantizada. Ante fallo de envío la propuesta sigue bloqueada y permite reintentar sin crear otra aceptación. No se manda copia del PDF comercial por correo.

Mantener acceso administrativo restringido, copias de seguridad privadas y política de conservación de aceptación/documentos conforme a obligaciones aplicables. Purgar periódicamente desafíos y sesiones vencidas y contadores antiguos; conservar por separado las evidencias necesarias. Si se exige evidencia reforzada o NOM-151, integrar un prestador adecuado antes de anunciar esa capacidad.

## Verificación ejecutada

Tres pruebas de integración con SQLite y servicio de correo simulado: autorización completa, reutilización de código, correo equivocado, rechazo de origen ajeno, consentimiento obligatorio, bloqueo sin configurar, bloqueo ante fallo de correo y reintento, preservación de instantáneas, acceso privado y revocación. Comprobación de sintaxis del Worker y JavaScript del navegador. Pendiente despliegue/entrega real y revisión visual en navegador.
