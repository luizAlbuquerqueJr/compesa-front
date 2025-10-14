// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB9ssHqDobDnrp-mZ-Qs7Aw-X-OD8Zp3QM",
    authDomain: "caixa-d-agua-a1a55.firebaseapp.com",
    databaseURL: "https://caixa-d-agua-a1a55-default-rtdb.firebaseio.com",
    projectId: "caixa-d-agua-a1a55",
    storageBucket: "caixa-d-agua-a1a55.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};

// Configurações da aplicação
const appConfig = {
    // Intervalo de atualização automática (ms)
    updateInterval: 30000, // 30 segundos
    
    // Configurações do gráfico
    chart: {
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        borderColor: '#3498db',
        borderWidth: 2,
        pointBackgroundColor: '#3498db',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        
        // Cores para eventos da COMPESA
        compesaEventColor: '#e74c3c',
        compesaEventBorderColor: '#c0392b',
        
        // Linha de tendência
        trendLineColor: '#f39c12',
        trendLineWidth: 2
    },
    
    // Configurações de período
    periods: {
        '24h': {
            label: '24 Horas',
            hours: 24,
            pointInterval: 1 // 1 hora
        },
        '7d': {
            label: '7 Dias',
            hours: 24 * 7,
            pointInterval: 6 // 6 horas
        },
        '30d': {
            label: '30 Dias',
            hours: 24 * 30,
            pointInterval: 24 // 24 horas
        },
        'all': {
            label: 'Todos os Dados',
            hours: null,
            pointInterval: 1 // 1 hora - máximo de pontos
        }
    },
    
    // Thresholds para níveis
    levels: {
        low: 40,    // < 40% = baixo
        medium: 80  // 40-80% = médio, > 80% = alto
    },
    
    // Configurações da COMPESA
    compesa: {
        // Variação mínima para detectar chegada de água (%)
        minIncrease: 5,
        // Intervalo esperado entre chegadas (horas)
        expectedInterval: 72
    }
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
