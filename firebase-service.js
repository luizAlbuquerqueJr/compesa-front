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

    // Obter dados da última chegada da COMPESA
    async getLastCompesaData() {
        try {
            const snapshot = await this.database.ref('latest').once('value');
            const data = snapshot.val();
            
            if (data && data.last_compesa_timestamp) {
                return {
                    timestamp: parseInt(data.last_compesa_timestamp),
                    datetime: data.last_compesa_datetime,
                    level: data.last_compesa_level,
                    date: new Date(parseInt(data.last_compesa_timestamp))
                };
            }
            return null;
        } catch (error) {
            console.error('Erro ao buscar dados da última COMPESA:', error);
            return null;
        }
    }

    // Obter histórico de chegadas da COMPESA
    async getCompesaArrivals(limit = 10) {
        try {
            const arrivals = [];
            const arrivalsRef = this.database.ref('compesa_arrivals');
            const snapshot = await arrivalsRef.once('value');
            const dateData = snapshot.val();

            if (!dateData) return arrivals;

            // Processar cada data
            for (const [date, timestamps] of Object.entries(dateData)) {
                for (const [timestamp, data] of Object.entries(timestamps)) {
                    const timestampMs = parseInt(timestamp);
                    const dateObj = new Date(timestampMs);
                    
                    if (!isNaN(dateObj.getTime()) && timestampMs > 0) {
                        arrivals.push({
                            timestamp: timestampMs,
                            date: dateObj,
                            dateStr: date,
                            previousLevel: data.previous_level,
                            newLevel: data.new_level,
                            increase: data.increase,
                            datetime: data.datetime,
                            formatted: this.formatDateTime(dateObj)
                        });
                    }
                }
            }

            // Ordenar por timestamp (mais recente primeiro) e limitar
            arrivals.sort((a, b) => b.timestamp - a.timestamp);
            return limit > 0 ? arrivals.slice(0, limit) : arrivals;
        } catch (error) {
            console.error('Erro ao buscar chegadas da COMPESA:', error);
            return [];
        }
    }


    // Obter dados históricos por período
    async getHistoricalData(period = '24h') {
        const cacheKey = `historical_${period}`;
        
        // Para "all", usar cache mais longo (5 minutos) pois são mais dados
        const cacheTimeout = period === 'all' ? 300000 : 60000;
        
        // Verificar cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < cacheTimeout) {
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

            // Para "all", não limitar por endTime
            const endTime = periodConfig.hours ? now : null;
            const data = await this.fetchSensorReadings(startTime, endTime);
            console.log(`[${period}] Dados brutos: ${data.length}, Intervalo: ${periodConfig.pointInterval}h`);
            const processedData = this.processSensorData(data, periodConfig.pointInterval);
            console.log(`[${period}] Dados processados: ${processedData.length}`);

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
            console.log(`Datas disponíveis no Firebase: ${Object.keys(dateData).join(', ')}`);
            for (const [date, timestamps] of Object.entries(dateData)) {
                let dateCount = 0;
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
                        dateCount++;
                    } else {
                        console.warn('Timestamp inválido ignorado:', timestamp, timestampMs);
                    }
                }
                if (dateCount > 0) {
                    console.log(`Data ${date}: ${dateCount} leituras`);
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

        // Para intervalos muito grandes ou poucos dados, mostrar todos
        if (readings.length <= 50 || intervalHours >= 24) {
            return readings.map(reading => ({
                x: reading.timestamp,
                y: reading.percentage,
                date: reading.date,
                formatted: this.formatDateTime(reading.date)
            }));
        }

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
    calculateStats(readings, events, period = '7d') {
        if (!readings.length) {
            return {
                avgLevel: 0,
                lastCompesa: null,
                nextCompesa: null
            };
        }

        // Nível médio dos dados fornecidos (baseado no período atual)
        const avgLevel = readings.length > 0 
            ? readings.reduce((sum, r) => sum + r.y, 0) / readings.length
            : 0;

        // Último evento da COMPESA
        const lastCompesa = events.length > 0 ? events[events.length - 1] : null;

        // Próxima COMPESA estimada (72h após a última)
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
            nextCompesa
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
            
            // Usar formatação manual para garantir formato dd/mm/yyyy
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
            
            // Usar formatação manual para garantir formato dd/mm/yyyy
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
        console.log('Cache do Firebase limpo');
    }

    // Gravar acionamento manual da bomba
    async savePumpActivation() {
        try {
            const now = new Date();
            const timestamp = now.getTime();
            const date = this.getCurrentDate();
            
            const pumpData = {
                timestamp: timestamp,
                date: this.formatDateTime(now),
                type: 'manual_pump',
                action: 'activated',
                user_triggered: true,
                status: 'on'
            };

            // Salvar em pump_activations/YYYY-MM-DD/timestamp
            const pumpPath = `pump_activations/${date}/${timestamp}`;
            await firebase.database().ref(pumpPath).set(pumpData);
            
            // Atualizar status da bomba em latest
            await this.updatePumpStatus(true, timestamp);
            
            console.log('✅ Acionamento da bomba gravado:', pumpPath);
            return { success: true, timestamp, data: pumpData };
            
        } catch (error) {
            console.error('❌ Erro ao gravar acionamento da bomba:', error);
            return { success: false, error: error.message };
        }
    }

    // Desligar bomba manualmente
    async savePumpDeactivation() {
        try {
            const now = new Date();
            const timestamp = now.getTime();
            const date = this.getCurrentDate();
            
            // Buscar última ativação para calcular duração
            const lastActivation = await this.getLastPumpActivation();
            let duration = null;
            let durationString = null;
            
            if (lastActivation && lastActivation.status === 'on') {
                duration = timestamp - lastActivation.timestamp;
                durationString = this.formatDuration(duration);
                
                // Atualizar registro da ativação com duração
                const activationPath = `pump_activations/${this.getCurrentDate(lastActivation.timestamp)}/${lastActivation.timestamp}`;
                await firebase.database().ref(activationPath).update({
                    deactivated_at: timestamp,
                    deactivated_date: this.formatDateTime(now),
                    duration: duration,
                    duration_string: durationString,
                    status: 'off'
                });
            }
            
            const pumpData = {
                timestamp: timestamp,
                date: this.formatDateTime(now),
                type: 'manual_pump',
                action: 'deactivated',
                user_triggered: true,
                status: 'off',
                duration: duration,
                duration_string: durationString
            };

            // Salvar desativação
            const pumpPath = `pump_activations/${date}/${timestamp}`;
            await firebase.database().ref(pumpPath).set(pumpData);
            
            // Atualizar status da bomba em latest
            await this.updatePumpStatus(false, timestamp);
            
            console.log('✅ Desligamento da bomba gravado:', pumpPath);
            return { success: true, timestamp, data: pumpData, duration: durationString };
            
        } catch (error) {
            console.error('❌ Erro ao gravar desligamento da bomba:', error);
            return { success: false, error: error.message };
        }
    }

    // Atualizar status da bomba em latest
    async updatePumpStatus(isOn, timestamp) {
        try {
            const statusData = {
                pump_is_on: isOn,
                pump_last_activation: timestamp,
                pump_last_update: this.formatDateTime(new Date())
            };
            
            await firebase.database().ref('latest').update(statusData);
            console.log('✅ Status da bomba atualizado em latest:', statusData);
            
        } catch (error) {
            console.error('❌ Erro ao atualizar status da bomba:', error);
        }
    }

    // Buscar última ativação da bomba
    async getLastPumpActivation() {
        try {
            const snapshot = await firebase.database().ref('pump_activations').orderByChild('timestamp').limitToLast(10).once('value');
            const data = snapshot.val();
            
            if (!data) return null;

            let lastActivation = null;
            
            // Percorrer todas as datas e timestamps
            Object.keys(data).forEach(date => {
                const dayData = data[date];
                Object.keys(dayData).forEach(timestamp => {
                    const activation = dayData[timestamp];
                    if (activation.action === 'activated' && activation.status === 'on') {
                        if (!lastActivation || activation.timestamp > lastActivation.timestamp) {
                            lastActivation = activation;
                        }
                    }
                });
            });

            return lastActivation;
            
        } catch (error) {
            console.error('❌ Erro ao buscar última ativação:', error);
            return null;
        }
    }

    // Formatar duração em hh:mm:ss
    formatDuration(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Método auxiliar para obter data no formato YYYY-MM-DD de um timestamp
    getCurrentDate(timestamp = null) {
        const date = timestamp ? new Date(timestamp) : new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Buscar acionamentos da bomba por período
    async getPumpActivations(period = '7d') {
        try {
            let startTime = 0;
            
            if (period !== 'all') {
                const periodConfig = appConfig.periods[period];
                if (periodConfig && periodConfig.hours) {
                    startTime = Date.now() - (periodConfig.hours * 60 * 60 * 1000);
                }
            }

            const snapshot = await firebase.database().ref('pump_activations').once('value');
            const data = snapshot.val();
            
            if (!data) return [];

            const activations = [];
            
            // Percorrer todas as datas
            Object.keys(data).forEach(date => {
                const dayData = data[date];
                Object.keys(dayData).forEach(timestamp => {
                    const activation = dayData[timestamp];
                    const activationTime = parseInt(timestamp);
                    
                    if (activationTime >= startTime) {
                        activations.push({
                            timestamp: activationTime,
                            date: new Date(activationTime),
                            ...activation
                        });
                    }
                });
            });

            // Ordenar por timestamp
            activations.sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`📊 Acionamentos da bomba encontrados para ${period}:`, activations.length);
            return activations;
            
        } catch (error) {
            console.error('❌ Erro ao buscar acionamentos da bomba:', error);
            return [];
        }
    }

    // Método auxiliar para obter data atual no formato YYYY-MM-DD
    getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Excluir evento da COMPESA
    async deleteCompesaEvent(timestamp, dateStr) {
        try {
            console.log(`🗑️ Excluindo evento da COMPESA: ${timestamp} (${dateStr})`);
            
            // Excluir do Firebase
            const eventPath = `compesa_arrivals/${dateStr}/${timestamp}`;
            await firebase.database().ref(eventPath).remove();
            
            // Buscar todas as chegadas restantes para atualizar latest
            const allArrivals = await this.getCompesaArrivals(0); // 0 = sem limite
            
            if (allArrivals.length > 0) {
                // Pegar o evento mais recente
                const latestArrival = allArrivals[0]; // já vem ordenado por timestamp desc
                
                // Atualizar latest com o último evento restante
                const latestData = {
                    last_compesa_level: latestArrival.newLevel,
                    last_compesa_timestamp: latestArrival.timestamp,
                    last_compesa_datetime: latestArrival.formatted
                };
                
                await firebase.database().ref('latest').update(latestData);
                console.log('✅ Latest atualizado com último evento restante:', latestData);
            } else {
                // Se não há mais eventos, limpar latest
                const latestData = {
                    last_compesa_level: null,
                    last_compesa_timestamp: null,
                    last_compesa_datetime: null
                };
                
                await firebase.database().ref('latest').update(latestData);
                console.log('✅ Latest limpo - nenhum evento restante');
            }
            
            console.log('✅ Evento da COMPESA excluído com sucesso');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Erro ao excluir evento da COMPESA:', error);
            return { success: false, error: error.message };
        }
    }

    // Salvar chegada manual da COMPESA
    async saveManualCompesaArrival(arrivalData) {
        try {
            const dateStr = this.getCurrentDate(arrivalData.timestamp);
            
            console.log(`💾 Salvando chegada manual da COMPESA: ${dateStr}/${arrivalData.timestamp}`);
            
            // Salvar em compesa_arrivals/YYYY-MM-DD/timestamp
            const arrivalPath = `compesa_arrivals/${dateStr}/${arrivalData.timestamp}`;
            await firebase.database().ref(arrivalPath).set(arrivalData);
            
            // Atualizar latest com esta chegada se for a mais recente
            const latestData = await this.getLatestData();
            const currentLastTimestamp = latestData?.last_compesa_timestamp || 0;
            
            if (arrivalData.timestamp > currentLastTimestamp) {
                const latestUpdate = {
                    last_compesa_level: arrivalData.new_level,
                    last_compesa_timestamp: arrivalData.timestamp,
                    last_compesa_datetime: arrivalData.datetime
                };
                
                await firebase.database().ref('latest').update(latestUpdate);
                console.log('✅ Latest atualizado com chegada manual:', latestUpdate);
            }
            
            console.log('✅ Chegada manual da COMPESA salva com sucesso');
            return { success: true, timestamp: arrivalData.timestamp, data: arrivalData };
            
        } catch (error) {
            console.error('❌ Erro ao salvar chegada manual da COMPESA:', error);
            return { success: false, error: error.message };
        }
    }

    // Buscar última ativação da bomba com duração
    async getLastPumpActivationWithDuration() {
        try {
            const snapshot = await firebase.database().ref('pump_activations').orderByChild('timestamp').limitToLast(20).once('value');
            const data = snapshot.val();
            
            if (!data) return null;

            let lastActivationWithDuration = null;
            
            // Percorrer todas as datas e timestamps para encontrar a última com duração
            Object.keys(data).forEach(date => {
                const dayData = data[date];
                Object.keys(dayData).forEach(timestamp => {
                    const activation = dayData[timestamp];
                    // Buscar ativações que foram desligadas (têm duração)
                    if (activation.action === 'activated' && activation.duration_string) {
                        if (!lastActivationWithDuration || activation.timestamp > lastActivationWithDuration.timestamp) {
                            lastActivationWithDuration = activation;
                        }
                    }
                });
            });

            return lastActivationWithDuration;
            
        } catch (error) {
            console.error('❌ Erro ao buscar última ativação com duração:', error);
            return null;
        }
    }
}

// Instância global do serviço
const firebaseService = new FirebaseService();
