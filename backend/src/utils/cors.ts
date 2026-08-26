import cors from 'cors';

// Los 2 de siempre (dev local) SIEMPRE están permitidos, pase lo que
// pase con la env var — así el flujo de desarrollo de todos los días
// no depende de tener nada seteado. ALLOWED_ORIGINS (.env, opcional)
// agrega orígenes extra sin tocar código — para pruebas en red
// (docs/roadmap/pendientes-sin-definir.md no lo cubre, es
// infraestructura de instalación, no una funcionalidad del producto):
// el hostname público del frontend detrás del túnel.
const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
];

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

const allowedOrigins = [...defaultOrigins, ...extraOrigins];

export default cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
});
