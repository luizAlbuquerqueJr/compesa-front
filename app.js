// Aplicação principal
class WaterMonitorApp {
    constructor() {
        this.chartManager = null;
        this.updateInterval = null;
        this.currentPeriod = '24h';
        this.iconClickCount = 0;
        this.iconClickTimeout = null;
        
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

        // Checkbox de eventos da bomba
        const pumpCheckbox = document.getElementById('showPumpEvents');
        if (pumpCheckbox) {
            pumpCheckbox.addEventListener('change', (e) => {
                this.chartManager.togglePumpEvents(e.target.checked);
            });
        }

        // Botão da bomba
        const pumpButton = document.getElementById('pumpButton');
        if (pumpButton) {
            pumpButton.addEventListener('click', () => {
                this.activatePump();
            });
        }

        // Ícone da caixa d'água (contador de cliques para mostrar controle da bomba)
        const waterTankIcon = document.querySelector('.water-tank-icon');
        if (waterTankIcon) {
            waterTankIcon.addEventListener('click', () => {
                this.handleIconClick();
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
        
        // Atualizar label inicial do nível médio
        this.updateAverageLevelLabel(this.currentPeriod);
        
        // Verificar se deve mostrar card da bomba via query param
        this.checkAdminAccess();
        
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
            // Buscar dados da última COMPESA do Firebase
            const lastCompesaData = await firebaseService.getLastCompesaData();
            // Usar o período atual para calcular estatísticas
            const data = await firebaseService.getHistoricalData(this.currentPeriod);
            const events = firebaseService.detectCompesaEvents(data);
            const stats = firebaseService.calculateStats(data, events, this.currentPeriod);

            // Nível médio
            const avgElement = document.getElementById('avgLevel');
            if (avgElement) {
                avgElement.textContent = `${stats.avgLevel}%`;
            }

            // Última COMPESA - usar dados do Firebase se disponível
            const lastCompesaElement = document.getElementById('lastCompesa');
            if (lastCompesaElement) {
                if (lastCompesaData) {
                    lastCompesaElement.textContent = firebaseService.formatDateTime(lastCompesaData.date);
                } else if (stats.lastCompesa) {
                    lastCompesaElement.textContent = firebaseService.formatRelativeTime(stats.lastCompesa.date);
                } else {
                    lastCompesaElement.textContent = 'Ainda não detectada';
                }
            }

            // Próxima COMPESA - calcular baseado na última + 3 dias
            const nextCompesaElement = document.getElementById('nextCompesa');
            if (nextCompesaElement) {
                let nextCompesaDate = null;
                
                if (lastCompesaData) {
                    // Usar dados do Firebase + 3 dias
                    nextCompesaDate = new Date(lastCompesaData.date.getTime() + (3 * 24 * 60 * 60 * 1000));
                } else if (stats.lastCompesa) {
                    // Fallback para dados detectados + 3 dias
                    nextCompesaDate = new Date(stats.lastCompesa.date.getTime() + (3 * 24 * 60 * 60 * 1000));
                }
                
                if (nextCompesaDate && !isNaN(nextCompesaDate.getTime())) {
                    const now = new Date();
                    if (nextCompesaDate > now) {
                        // Mostrar apenas a data no formato dd/mm/yyyy
                        const formattedDate = firebaseService.formatDate(nextCompesaDate);
                        nextCompesaElement.textContent = formattedDate;
                        nextCompesaElement.style.color = '';
                    } else {
                        const formattedDate = firebaseService.formatDate(nextCompesaDate);
                        nextCompesaElement.textContent = formattedDate;
                        nextCompesaElement.style.color = '#e74c3c';
                    }
                } else {
                    nextCompesaElement.textContent = 'Não prevista';
                    nextCompesaElement.style.color = '';
                }
            }


        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    }

    // Atualizar lista de eventos
    async updateEventsList() {
        try {
            // Usar os novos dados de chegadas da COMPESA
            const compesaArrivals = await firebaseService.getCompesaArrivals(20);
            
            const eventsList = document.getElementById('eventsList');
            if (!eventsList) return;

            if (compesaArrivals.length === 0) {
                eventsList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">Nenhuma chegada da COMPESA detectada ainda.</p>';
                return;
            }
            
            eventsList.innerHTML = compesaArrivals.map(arrival => `
                <div class="event-item fade-in">
                    <div>
                        <div class="event-date">${arrival.formatted}</div>
                        <div class="event-details">
                            ${firebaseService.formatRelativeTime(arrival.date)} • 
                            Aumento de ${arrival.increase}% (${arrival.previousLevel}% → ${arrival.newLevel}%)
                        </div>
                    </div>
                    <div class="event-level">${arrival.newLevel}%</div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Erro ao atualizar lista de eventos:', error);
        }
    }

    // Mudar período do gráfico
    async changePeriod(period) {
        if (period === this.currentPeriod) return;

        // Limpar cache se mudando para "all" para garantir dados frescos
        if (period === 'all') {
            firebaseService.clearCache();
        }

        // Atualizar botões
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-period="${period}"]`).classList.add('active');

        // Atualizar período atual
        this.currentPeriod = period;

        // Atualizar texto do nível médio para refletir o período atual
        this.updateAverageLevelLabel(period);

        // Atualizar gráfico
        await this.chartManager.updateChart(period);
        
        // Atualizar estatísticas com o novo período
        await this.updateStatistics();
    }

    // Atualizar label do nível médio baseado no período
    updateAverageLevelLabel(period) {
        // Encontrar o card que contém o elemento avgLevel
        const avgLevelElement = document.getElementById('avgLevel');
        if (avgLevelElement) {
            const avgLevelCard = avgLevelElement.parentElement.querySelector('h3');
            if (avgLevelCard) {
                const periodLabels = {
                    '24h': '24 Horas',
                    '7d': '7 Dias', 
                    '30d': '30 Dias',
                    'all': 'Todos os Dados'
                };
                avgLevelCard.textContent = `Nível Médio (${periodLabels[period] || period})`;
            }
        }
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

    // Ativar/Desativar bomba manualmente
    async activatePump() {
        const pumpButton = document.getElementById('pumpButton');
        if (!pumpButton) return;

        try {
            // Verificar estado atual da bomba
            const latestData = await firebaseService.getLatestData();
            const isCurrentlyOn = latestData?.pump_is_on || false;
            
            // Feedback visual - botão em estado de loading
            pumpButton.disabled = true;
            pumpButton.classList.add('loading');
            pumpButton.innerHTML = isCurrentlyOn ? '⏳ Desligando...' : '⏳ Ligando...';

            console.log(`🔄 ${isCurrentlyOn ? 'Desligando' : 'Ligando'} bomba manualmente...`);

            // Gravar no Firebase
            const result = isCurrentlyOn 
                ? await firebaseService.savePumpDeactivation()
                : await firebaseService.savePumpActivation();

            if (result.success) {
                // Feedback de sucesso
                pumpButton.classList.remove('loading');
                pumpButton.classList.add('success');
                
                if (isCurrentlyOn) {
                    pumpButton.innerHTML = `✅ Bomba Desligada! (${result.duration || 'N/A'})`;
                    console.log('✅ Bomba desligada com sucesso:', result.timestamp);
                } else {
                    pumpButton.innerHTML = '✅ Bomba Ligada!';
                    console.log('✅ Bomba ligada com sucesso:', result.timestamp);
                }

                // Atualizar gráfico para mostrar o acionamento
                await this.chartManager.updateChart(this.currentPeriod);

                // Atualizar status do card
                setTimeout(async () => {
                    await this.updatePumpStatus();
                    pumpButton.disabled = false;
                    pumpButton.classList.remove('success');
                }, 3000);

            } else {
                throw new Error(result.error || 'Erro desconhecido');
            }

        } catch (error) {
            console.error('❌ Erro ao controlar bomba:', error);

            // Feedback de erro
            pumpButton.classList.remove('loading');
            pumpButton.style.background = '#e74c3c';
            pumpButton.innerHTML = '❌ Erro ao Controlar';

            // Resetar botão após 3 segundos
            setTimeout(async () => {
                pumpButton.disabled = false;
                pumpButton.style.background = '';
                await this.updatePumpStatus();
            }, 3000);

            // Mostrar erro para o usuário
            alert(`Erro ao controlar bomba: ${error.message}`);
        }
    }

    // Verificar acesso administrativo via query param
    checkAdminAccess() {
        const urlParams = new URLSearchParams(window.location.search);
        const adminParam = urlParams.get('admin');
        
        if (adminParam === '1') {
            console.log('🔑 Acesso administrativo detectado via query param');
            this.showPumpCard(true);
        }
    }

    // Gerenciar cliques no ícone da caixa d'água
    handleIconClick() {
        this.iconClickCount++;
        console.log(`🖱️ Clique ${this.iconClickCount}/7 no ícone da caixa d'água`);

        // Limpar timeout anterior
        if (this.iconClickTimeout) {
            clearTimeout(this.iconClickTimeout);
        }

        // Se chegou a 7 cliques, mostrar o card da bomba
        if (this.iconClickCount >= 7) {
            this.showPumpCard();
            this.iconClickCount = 0; // Reset contador
        } else {
            // Reset contador após 3 segundos de inatividade
            this.iconClickTimeout = setTimeout(() => {
                console.log('⏰ Timeout - resetando contador de cliques');
                this.iconClickCount = 0;
            }, 3000);
        }
    }

    // Mostrar card de controle da bomba
    showPumpCard(isAdminAccess = false) {
        const pumpCard = document.getElementById('pumpCard');
        if (pumpCard) {
            pumpCard.style.display = 'block';
            console.log('💧 Card de controle da bomba ativado!');
            
            // Atualizar status da bomba
            this.updatePumpStatus();
            
            // Scroll suave para o card da bomba
            pumpCard.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });

            // Auto-ocultar após 30 segundos por segurança (exceto para acesso admin)
            if (!isAdminAccess) {
                setTimeout(() => {
                    this.hidePumpCard();
                }, 30000);
            } else {
                console.log('🔑 Acesso administrativo - card permanecerá visível');
            }
        }
    }

    // Ocultar card de controle da bomba
    hidePumpCard() {
        const pumpCard = document.getElementById('pumpCard');
        if (pumpCard) {
            pumpCard.style.display = 'none';
            console.log('🔒 Card de controle da bomba ocultado');
        }
    }

    // Atualizar status da bomba no card
    async updatePumpStatus() {
        try {
            const latestData = await firebaseService.getLatestData();
            
            const statusElement = document.getElementById('pumpStatus');
            const lastActivationElement = document.getElementById('pumpLastActivation');
            const pumpButton = document.getElementById('pumpButton');
            
            if (latestData && statusElement && lastActivationElement && pumpButton) {
                const isOn = latestData.pump_is_on || false;
                const lastActivation = latestData.pump_last_activation;
                
                // Atualizar status
                statusElement.textContent = isOn ? '🟢 Ligada' : '🔴 Desligada';
                statusElement.className = `status-value ${isOn ? 'pump-on' : 'pump-off'}`;
                
                // Atualizar última ativação
                if (lastActivation) {
                    const date = new Date(lastActivation);
                    lastActivationElement.textContent = firebaseService.formatDateTime(date);
                } else {
                    lastActivationElement.textContent = 'Nunca';
                }
                
                // Atualizar botão
                if (isOn) {
                    pumpButton.innerHTML = '🛑 Desligar Bomba';
                    pumpButton.style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
                } else {
                    pumpButton.innerHTML = '<img src="water-pump.png" alt="Bomba" class="pump-icon-btn"> Ligar Bomba';
                    pumpButton.style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
                }
            }
            
        } catch (error) {
            console.error('❌ Erro ao atualizar status da bomba:', error);
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
