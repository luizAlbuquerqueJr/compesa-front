// Aplicação principal
class WaterMonitorApp {
    constructor() {
        this.chartManager = null;
        this.updateInterval = null;
        this.currentPeriod = '24h';
        
        this.init();
    }

    // Inicializar aplicação
    async init() {
        try {
            console.log('🚀 Iniciando aplicação...');
            
            // Verificar se Firebase está disponível
            if (typeof firebase === 'undefined') {
                throw new Error('Firebase não carregado. Verifique sua conexão com a internet.');
            }
            
            // Inicializar gerenciador de gráficos
            console.log('📊 Inicializando gráficos...');
            this.chartManager = new ChartManager('waterChart');
            
            // Configurar event listeners
            console.log('🎯 Configurando event listeners...');
            this.setupEventListeners();
            
            // Carregar dados iniciais
            console.log('📡 Carregando dados iniciais...');
            await this.loadInitialData();
            
            // Iniciar atualizações automáticas
            console.log('🔄 Iniciando atualizações automáticas...');
            this.startAutoUpdate();
            
            console.log('✅ Aplicação inicializada com sucesso');
        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            console.error('Stack trace:', error.stack);
            this.showError(`Erro ao inicializar: ${error.message}`);
        }
    }

    // Configurar event listeners
    setupEventListeners() {
        // Botões de período
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const period = e.target.dataset.period;
                this.changePeriod(period);
            });
        });

        // Checkbox de eventos da COMPESA
        const compesaCheckbox = document.getElementById('showCompesaEvents');
        if (compesaCheckbox) {
            compesaCheckbox.addEventListener('change', (e) => {
                this.chartManager.toggleCompesaEvents(e.target.checked);
            });
        }

        // Checkbox de linha de tendência
        const trendCheckbox = document.getElementById('showTrendLine');
        if (trendCheckbox) {
            trendCheckbox.addEventListener('change', (e) => {
                this.chartManager.toggleTrendLine(e.target.checked);
            });
        }

        // Redimensionamento da janela
        window.addEventListener('resize', () => {
            if (this.chartManager) {
                this.chartManager.resize();
            }
        });

        // Visibilidade da página (pausar atualizações quando não visível)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoUpdate();
            } else {
                this.startAutoUpdate();
            }
        });
    }

    // Carregar dados iniciais
    async loadInitialData() {
        // Carregar dados mais recentes
        await this.updateCurrentLevel();
        
        // Carregar gráfico
        await this.chartManager.updateChart(this.currentPeriod);
        
        // Carregar estatísticas
        await this.updateStatistics();
        
        // Carregar histórico de eventos
        await this.updateEventsList();
    }

    // Atualizar nível atual
    async updateCurrentLevel() {
        try {
            const latestData = await firebaseService.getLatestData();
            
            if (latestData) {
                // Atualizar nível atual
                const levelElement = document.getElementById('currentLevel');
                if (levelElement) {
                    levelElement.textContent = latestData.percentage.toFixed(1);
                    levelElement.className = `level-value ${this.getLevelClass(latestData.percentage)}`;
                }

                // Atualizar última atualização
                const updateElement = document.getElementById('lastUpdate');
                if (updateElement) {
                    console.log('Dados completos recebidos:', latestData);
                    
                    let lastUpdate;
                    
                    // Tentar encontrar timestamp nos dados
                    if (latestData.timestamp) {
                        console.log('Usando timestamp:', latestData.timestamp);
                        lastUpdate = new Date(parseInt(latestData.timestamp));
                    } else if (latestData.updated_at) {
                        console.log('Usando updated_at:', latestData.updated_at);
                        if (typeof latestData.updated_at === 'string') {
                            lastUpdate = new Date(latestData.updated_at);
                        } else if (latestData.updated_at.seconds) {
                            lastUpdate = new Date(latestData.updated_at.seconds * 1000);
                        } else if (typeof latestData.updated_at === 'number') {
                            lastUpdate = new Date(latestData.updated_at);
                        }
                    } else if (latestData.t) {
                        console.log('Usando t:', latestData.t);
                        lastUpdate = new Date(parseInt(latestData.t));
                    } else {
                        console.log('Nenhum campo de data encontrado, usando data atual');
                        lastUpdate = new Date();
                    }
                    
                    console.log('Data final processada:', lastUpdate);
                    
                    if (lastUpdate && !isNaN(lastUpdate.getTime())) {
                        const day = String(lastUpdate.getDate()).padStart(2, '0');
                        const month = String(lastUpdate.getMonth() + 1).padStart(2, '0');
                        const year = lastUpdate.getFullYear();
                        const hours = String(lastUpdate.getHours()).padStart(2, '0');
                        const minutes = String(lastUpdate.getMinutes()).padStart(2, '0');
                        updateElement.textContent = `${day}/${month}/${year} às ${hours}:${minutes}`;
                    } else {
                        console.error('Data ainda inválida:', lastUpdate);
                        updateElement.textContent = 'Aguardando dados...';
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao atualizar nível atual:', error);
        }
    }

    // Atualizar estatísticas
    async updateStatistics() {
        try {
            const data = await firebaseService.getHistoricalData('30d');
            const events = firebaseService.detectCompesaEvents(data);
            const stats = firebaseService.calculateStats(data, events);

            // Nível médio
            const avgElement = document.getElementById('avgLevel');
            if (avgElement) {
                avgElement.textContent = `${stats.avgLevel}%`;
            }

            // Última COMPESA
            const lastCompesaElement = document.getElementById('lastCompesa');
            if (lastCompesaElement) {
                if (stats.lastCompesa) {
                    lastCompesaElement.textContent = firebaseService.formatRelativeTime(stats.lastCompesa.date);
                } else {
                    lastCompesaElement.textContent = 'Nenhum evento detectado';
                }
            }

            // Próxima COMPESA
            const nextCompesaElement = document.getElementById('nextCompesa');
            if (nextCompesaElement) {
                if (stats.nextCompesa && stats.nextCompesa instanceof Date && !isNaN(stats.nextCompesa.getTime())) {
                    const now = new Date();
                    if (stats.nextCompesa > now) {
                        // Calcular tempo até a próxima
                        const diff = stats.nextCompesa - now;
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const days = Math.floor(hours / 24);
                        
                        if (days > 0) {
                            nextCompesaElement.textContent = `Em ${days} dia${days > 1 ? 's' : ''}`;
                        } else if (hours > 0) {
                            nextCompesaElement.textContent = `Em ${hours} hora${hours > 1 ? 's' : ''}`;
                        } else {
                            nextCompesaElement.textContent = 'Em breve';
                        }
                        nextCompesaElement.style.color = '';
                    } else {
                        nextCompesaElement.textContent = 'Atrasada';
                        nextCompesaElement.style.color = '#e74c3c';
                    }
                } else {
                    nextCompesaElement.textContent = 'Não prevista';
                    nextCompesaElement.style.color = '';
                }
            }

            // Total de eventos
            const totalEventsElement = document.getElementById('totalEvents');
            if (totalEventsElement) {
                totalEventsElement.textContent = stats.totalEvents;
            }

        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    }

    // Atualizar lista de eventos
    async updateEventsList() {
        try {
            const data = await firebaseService.getHistoricalData('all');
            const events = firebaseService.detectCompesaEvents(data);
            
            const eventsList = document.getElementById('eventsList');
            if (!eventsList) return;

            if (events.length === 0) {
                eventsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhum evento da COMPESA detectado ainda.</p>';
                return;
            }

            // Mostrar apenas os últimos 20 eventos
            const recentEvents = events.slice(-20).reverse();
            
            eventsList.innerHTML = recentEvents.map(event => `
                <div class="event-item fade-in">
                    <div>
                        <div class="event-date">${firebaseService.formatDateTime(event.date)}</div>
                        <div class="event-details">
                            ${firebaseService.formatRelativeTime(event.date)} • 
                            Aumento de ${event.increase.toFixed(1)}%
                        </div>
                    </div>
                    <div class="event-level">${event.newLevel.toFixed(1)}%</div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Erro ao atualizar lista de eventos:', error);
        }
    }

    // Mudar período do gráfico
    async changePeriod(period) {
        if (period === this.currentPeriod) return;

        // Atualizar botões
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-period="${period}"]`).classList.add('active');

        // Atualizar período atual
        this.currentPeriod = period;

        // Atualizar gráfico
        await this.chartManager.updateChart(period);
    }

    // Obter classe CSS para nível
    getLevelClass(level) {
        const levels = appConfig.levels;
        if (level < levels.low) {
            return 'level-low';
        } else if (level < levels.medium) {
            return 'level-medium';
        } else {
            return 'level-high';
        }
    }

    // Iniciar atualizações automáticas
    startAutoUpdate() {
        this.stopAutoUpdate(); // Limpar interval anterior
        
        this.updateInterval = setInterval(async () => {
            try {
                await this.updateCurrentLevel();
                
                // Atualizar gráfico a cada 2 minutos
                if (Date.now() % 120000 < appConfig.updateInterval) {
                    await this.chartManager.updateChart(this.currentPeriod);
                    await this.updateStatistics();
                }
            } catch (error) {
                console.error('Erro na atualização automática:', error);
            }
        }, appConfig.updateInterval);

        console.log('🔄 Atualizações automáticas iniciadas');
    }

    // Parar atualizações automáticas
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    // Mostrar erro
    showError(message) {
        // Criar elemento de erro se não existir
        let errorElement = document.getElementById('errorMessage');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'errorMessage';
            errorElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #e74c3c;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 1000;
                max-width: 300px;
            `;
            document.body.appendChild(errorElement);
        }

        errorElement.textContent = message;
        errorElement.style.display = 'block';

        // Remover após 5 segundos
        setTimeout(() => {
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }, 5000);
    }

    // Destruir aplicação
    destroy() {
        this.stopAutoUpdate();
        firebaseService.stopListening();
        
        if (this.chartManager) {
            this.chartManager.destroy();
        }
    }
}

// Handler de erros globais
window.addEventListener('error', (event) => {
    console.error('❌ Erro global capturado:', event.error);
    console.error('Arquivo:', event.filename, 'Linha:', event.lineno);
    
    if (window.app) {
        window.app.showError(`Erro inesperado: ${event.error.message}`);
    }
});

// Handler de promessas rejeitadas
window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promise rejeitada:', event.reason);
    
    if (window.app) {
        window.app.showError(`Erro de conexão: ${event.reason}`);
    }
    
    // Prevenir que o erro apareça no console
    event.preventDefault();
});

// Inicializar aplicação quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🌐 DOM carregado, inicializando aplicação...');
        window.app = new WaterMonitorApp();
    } catch (error) {
        console.error('❌ Erro fatal ao inicializar:', error);
        document.body.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: Arial, sans-serif;">
                <h1 style="color: #e74c3c;">❌ Erro ao Carregar</h1>
                <p style="color: #7f8c8d; margin: 20px 0;">${error.message}</p>
                <button onclick="location.reload()" style="padding: 10px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🔄 Recarregar Página
                </button>
            </div>
        `;
    }
});

// Cleanup ao sair da página
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.destroy();
    }
});
