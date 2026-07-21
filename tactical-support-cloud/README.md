# Tactical Support Cloud

Portal de atención y seguimiento técnico para Tactical IT S.A.C. Permite registrar solicitudes, consultar tickets propios y administrar el flujo operativo desde áreas separadas según el rol del usuario.

## Funcionalidades

- Registro e inicio de sesión de usuarios.
- Contraseñas protegidas mediante `scrypt`, salt individual y comparación segura.
- Cuenta administrativa creada automáticamente.
- Creación de tickets asociados al usuario autenticado.
- Área privada **Mis tickets** para cada cliente.
- Consulta de tickets limitada a su propietario o a un administrador.
- Panel administrativo protegido para listar y actualizar solicitudes.
- Vista administrativa completa para revisar los datos de cada ticket.
- Bitácora cronológica de avances con autor y fecha.
- Panel de métricas con indicadores de resolución, SLA y gráficos operativos.
- Gestión administrativa de usuarios, roles y restablecimiento de contraseñas.
- Sesiones persistentes con expiración de ocho horas.
- Diseño responsive alineado con la identidad visual de Tactical IT.

## Áreas del sistema

| Área | Ruta | Acceso |
|---|---|---|
| Portal público | `/` | Público |
| Acceso y registro | `/acceso.html` | Público |
| Cuenta del cliente | `/mi-cuenta` | Usuario autenticado |
| Panel administrativo | `/admin` | Solo administrador |

La cuenta inicial es `admin` / `admin123`. Debe cambiarse antes de desplegar el sistema fuera de un entorno controlado.

## Tecnologías

- Frontend: HTML, CSS y JavaScript.
- Backend: Node.js y Express.
- Seguridad HTTP: Helmet.
- Persistencia local: archivos JSON.
- Infraestructura: AWS EC2 mediante CloudFormation.
- Proceso Node.js: PM2.
- Proxy web: NGINX.

## Estructura

```text
tactical-support-cloud/
├── data/
│   ├── tickets.json
│   ├── users.json
│   └── sessions.json
├── infra/
│   └── cloudformation-ec2-basic.yaml
├── public/
│   ├── assets/
│   ├── css/
│   ├── js/
│   ├── acceso.html
│   └── index.html
├── scripts/
│   └── install-server.sh
├── views/
│   ├── account.html
│   └── admin.html
├── package.json
└── server.js
```

## Ejecución local

Requiere Node.js instalado.

```bash
npm install
npm start
```

Abrir `http://localhost:3000`.

## Datos

- `data/users.json`: cuentas, roles y hashes de contraseñas.
- `data/tickets.json`: solicitudes y relación con su propietario mediante `userId`.
- `data/sessions.json`: sesiones activas y fecha de expiración.

Los tickets existentes que no contienen `userId` se consideran registros históricos y solo aparecen en el panel administrativo.

## Seguridad

- El registro público siempre asigna el rol `user`.
- El rol no se acepta desde el cuerpo de la solicitud.
- Las rutas administrativas verifican la sesión y el rol en el servidor.
- Las cookies de sesión son `HttpOnly` y `SameSite=Strict`.
- La API impide que un usuario consulte tickets de otra cuenta.
- CloudFormation solicita el CIDR autorizado para SSH; el puerto 22 no queda abierto globalmente.

Para producción se recomienda usar HTTPS, establecer cookies `Secure`, añadir límites de intentos de acceso, reemplazar los JSON por DynamoDB o RDS y almacenar sesiones en un servicio persistente administrado.

## Despliegue en EC2

La plantilla usa Amazon Linux 2023 y realiza el despliegue automático mediante EC2 User Data. Instala Node.js 22, NGINX y Git; clona este repositorio, ejecuta `npm ci`, registra la aplicación como servicio de `systemd` y configura NGINX como proxy hacia el puerto interno 3000.

Al crear el stack se solicitan:

- `KeyName`: par de claves de EC2.
- `AdminCidr`: IP pública administrativa con `/32`, por ejemplo `203.0.113.10/32`.
- `InstanceType`: `t3.micro` por defecto en Virginia (`us-east-1`).
- `RepositoryUrl`: repositorio público desde el que se descarga la aplicación.

El Security Group publica únicamente HTTP en el puerto 80 y restringe SSH a `AdminCidr`. El puerto 3000 no se expone a Internet. El proceso se reinicia automáticamente mediante `systemd` y los registros de instalación quedan en `/var/log/tactical-install.log`.

No se deben guardar credenciales de AWS dentro del repositorio.
