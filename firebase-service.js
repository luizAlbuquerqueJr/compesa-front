// Serviço para interação com Firebase
class FirebaseService {
    constructor() {
        this.database = firebase.database();
        this.cache = new Map();
        this.listeners = [];
    }

    // Obter dados mais recentes
    async getLatestData() {
        try {
            const snapshot = await this.database.ref('latest').once('value');
            return snapshot.val();
        } catch (error) {
            console.error('Erro ao buscar dados mais recentes:', error);
            return null;
        }
    }

    // Obter dados históricos por período
    async getHistoricalData(period = '24h') {
        const cacheKey = `historical_${period}`;
        
        // Verificar cache (válido por 1 minuto)
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 60000) {
                return cached.data;
            }
        }

        try {
            const periodConfig = appConfig.periods[period];
            const now = Date.now();
            let startTime = null;

            if (periodConfig.hours) {
                startTime = now - (periodConfig.hours * 60 * 60 * 1000);
            }

            const data = await this.fetchSensorReadings(startTime, now);
            const processedData = this.processSensorData(data, periodConfig.pointInterval);

            // Armazenar no cache
            this.cache.set(cacheKey, {
                data: processedData,
                timestamp: Date.now()
            });

            return processedData;
        } catch (error) {
            console.error('Erro ao buscar dados históricos:', error);
            return [];
        }
    }

    // Buscar leituras do sensor por período
    async fetchSensorReadings(startTime = null, endTime = null) {
        const readings = [];
        const sensorRef = this.database.ref('sensor_readings');

        try {
            const snapshot = await sensorRef.once('value');
            const dateData = snapshot.val();

            if (!dateData) return readings;

            // Processar cada data
            for (const [date, timestamps] of Object.entries(dateData)) {
                for (const [timestamp, data] of Object.entries(timestamps)) {
                    const timestampMs = parseInt(timestamp);
                    
                    // Filtrar por período se especificado
                    if (startTime && timestampMs < startTime) continue;
                    if (endTime && timestampMs > endTime) continue;

                    // Validar timestamp antes de criar Date
                    const dateObj = new Date(timestampMs);
                    if (!isNaN(dateObj.getTime()) && timestampMs > 0) {
                        readings.push({
                            timestamp: timestampMs,
                            percentage: data.p,
                            date: dateObj,
                            dateStr: date
                        });
                    } else {
                        console.warn('Timestamp inválido ignorado:', timestamp, timestampMs);
                    }
                }
            }

            // Ordenar por timestamp
            readings.sort((a, b) => a.timestamp - b.timestamp);
            return readings;
        } catch (error) {
            console.error('Erro ao buscar leituras do sensor:', error);
            return [];
        }
    }

    // Processar dados do sensor para o gráfico
    processSensorData(readings, intervalHours = 1) {
        if (!readings.length) return [];

        const intervalMs = intervalHours * 60 * 60 * 1000;
        const processed = [];
        let lastTimestamp = 0;

        for (const reading of readings) {
            // Agrupar por intervalo para reduzir pontos no gráfico
            if (reading.timestamp - lastTimestamp >= intervalMs) {
                processed.push({
                    x: reading.timestamp,
                    y: reading.percentage,
                    date: reading.date,
                    formatted: this.formatDateTime(reading.date)
                });
                lastTimestamp = reading.timestamp;
            }
        }

        return processed;
    }

    // Detectar eventos da COMPESA
    detectCompesaEvents(readings) {
        const events = [];
        const minIncrease = appConfig.compesa.minIncrease;

        for (let i = 1; i < readings.length; i++) {
            const current = readings[i];
            const previous = readings[i - 1];
            
            // Detectar aumento significativo (chegada da COMPESA)
            const increase = current.percentage - previous.percentage;
            if (increase >= minIncrease) {
                events.push({
                    timestamp: current.timestamp,
                    date: current.date,
                    previousLevel: previous.percentage,
                    newLevel: current.percentage,
                    increase: increase,
                    formatted: this.formatDateTime(current.date)
                });
            }
        }

        return events;
    }

    // Calcular estatísticas
    calculateStats(readings, events) {
        if (!readings.length) {
            return {
                avgLevel: 0,
                lastCompesa: null,
                nextCompesa: null,
                totalEvents: 0
            };
        }

        // Nível médio dos últimos 7 dias
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const recentReadings = readings.filter(r => r.timestamp >= sevenDaysAgo);
        const avgLevel = recentReadings.length > 0 
            ? recentReadings.reduce((sum, r) => sum + r.percentage, 0) / recentReadings.length
            : 0;

        // Último evento da COMPESA
        const lastCompesa = events.length > 0 ? events[events.length - 1] : null;

        // Próxima COMPESA estimada (48h após a última)
        let nextCompesa = null;
        if (lastCompesa && lastCompesa.timestamp && !isNaN(lastCompesa.timestamp)) {
            const expectedInterval = appConfig.compesa.expectedInterval * 60 * 60 * 1000;
            const nextTimestamp = lastCompesa.timestamp + expectedInterval;
            const nextDate = new Date(nextTimestamp);
            
            // Validar se a data calculada é válida
            if (!isNaN(nextDate.getTime())) {
                nextCompesa = nextDate;
            }
        }

        return {
            avgLevel: Math.round(avgLevel * 10) / 10,
            lastCompesa,
            nextCompesa,
            totalEvents: events.length
        };
    }

    // Escutar mudanças em tempo real
    listenToLatestData(callback) {
        const listener = this.database.ref('latest').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && callback) {
                callback(data);
            }
        });

        this.listeners.push({
            ref: 'latest',
            listener: listener
        });

        return listener;
    }

    // Parar de escutar mudanças
    stopListening() {
        this.listeners.forEach(({ ref, listener }) => {
            this.database.ref(ref).off('value', listener);
        });
        this.listeners = [];
    }

    // Formatar data/hora
    formatDateTime(date) {
        try {
            // Verificar se date é válida
            if (!date || isNaN(date.getTime())) {
                return 'Data inválida';
            }
            
            // Tentar usar Intl.DateTimeFormat
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                return new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo'
                }).format(date);
            }
            
            // Fallback manual
            return this.formatDateManual(date);
        } catch (error) {
            console.warn('Erro ao formatar data:', error);
            return this.formatDateManual(date);
        }
    }

    // Formatar data apenas
    formatDate(date) {
        try {
            if (!date || isNaN(date.getTime())) {
                return 'Data inválida';
            }
            
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
                return new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    timeZone: 'America/Sao_Paulo'
                }).format(date);
            }
            
            return this.formatDateManual(date, false);
        } catch (error) {
            console.warn('Erro ao formatar data:', error);
            return this.formatDateManual(date, false);
        }
    }

    // Formatação manual como fallback
    formatDateManual(date, includeTime = true) {
        if (!date || isNaN(date.getTime())) {
            return 'Data inválida';
        }
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        
        if (includeTime) {
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        }
        
        return `${day}/${month}/${year}`;
    }

    // Formatar tempo relativo
    formatRelativeTime(date) {
        try {
            // Verificar se date é válida
            if (!date || isNaN(date.getTime())) {
                return 'Data inválida';
            }
            
            const now = new Date();
            const diff = now - date;
            
            // Verificar se a diferença é válida
            if (isNaN(diff)) {
                return 'Data inválida';
            }
            
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) {
                return `${days} dia${days > 1 ? 's' : ''} atrás`;
            } else if (hours > 0) {
                return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
            } else if (minutes > 0) {
                return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
            } else {
                return 'Agora mesmo';
            }
        } catch (error) {
            console.warn('Erro ao formatar tempo relativo:', error);
            return 'Data inválida';
        }
    }

    // Limpar cache
    clearCache() {
        this.cache.clear();
    }
}

// Instância global do serviço
const firebaseService = new FirebaseService();
