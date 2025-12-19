// Gerenciador de gráficos - Versão Limpa
console.log('📊 Carregando ChartManager...');

class ChartManager {
    constructor(canvasId) {
        console.log('🏗️ Construindo ChartManager para:', canvasId);
        
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas com ID '${canvasId}' não encontrado`);
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.chart = null;
        this.currentPeriod = '24h';
        this.showCompesaEvents = true;
        this.showTrendLine = false;
        this.showPumpEvents = true;
        this.data = [];
        this.events = [];
        this.compesaArrivals = [];
        this.pumpActivations = [];
        this.isAdminMode = false;
        this.selectedPoint = null;
        this.shiftPressed = false;
        
        // Carregar ícone da bomba
        this.pumpIcon = new Image();
        this.pumpIcon.src = 'water-pump.png';
        this.pumpIconLoaded = false;
        this.pumpIcon.onload = () => {
            this.pumpIconLoaded = true;
            console.log('✅ Ícone da bomba carregado');
        };
        
        // Verificar se Chart.js está disponível
        if (typeof Chart === 'undefined') {
            throw new Error('Chart.js não está carregado');
        }
        
        // Registrar plugin de zoom
        if (typeof Chart.register === 'function' && typeof zoomPlugin !== 'undefined') {
            Chart.register(zoomPlugin);
            console.log('✅ Plugin de zoom registrado');
        } else {
            console.warn('⚠️ Plugin de zoom não encontrado');
        }
        
        this.initChart();
        
        // Configurar controles de zoom
        this.setupZoomControls();
        
        // Configurar zoom customizado para desktop
        this.setupCustomZoom();
        
        // Forçar tamanho pequeno dos pontos após inicialização
        this.forceSmallPoints();
    }

    // Detectar se é dispositivo móvel
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0);
    }

    // Inicializar gráfico
    initChart() {
        const config = appConfig.chart;
        const isMobile = this.isMobileDevice();
        
        // Plugin para desenhar linhas verticais da COMPESA e Bomba
        const verticalLinesPlugin = {
            id: 'verticalLines',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const xScale = chart.scales.x;
                
                ctx.save();
                
                // Linhas da COMPESA
                if (this.showCompesaEvents && this.compesaArrivals.length) {
                    // Ordenar por timestamp (mais antigo primeiro)
                    const sortedArrivals = [...this.compesaArrivals].sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Separar por tipo:
                    // - hasWaterEnded: registros novos que têm a propriedade water_ended definida
                    // - legacyArrivals: registros antigos sem a propriedade (apenas linha vertical)
                    const newFormatRecords = sortedArrivals.filter(c => c.waterEnded !== undefined && c.waterEnded !== null);
                    const legacyArrivals = sortedArrivals.filter(c => c.waterEnded === undefined || c.waterEnded === null);
                    
                    // Dos novos, separar início (false) e fim (true)
                    const starts = newFormatRecords.filter(c => c.waterEnded === false);
                    const ends = newFormatRecords.filter(c => c.waterEnded === true);
                    
                    // Sombreamento verde entre início e fim (apenas para novos registros)
                    starts.forEach((start) => {
                        // Encontrar o fim correspondente: o PRÓXIMO registro com water_ended=true após este início
                        // e que não tenha outro início no meio
                        const correspondingEnd = ends.find(end => {
                            if (end.timestamp <= start.timestamp) return false;
                            // Verificar se não há outro início entre este start e o end
                            const hasStartInBetween = starts.some(s => 
                                s.timestamp > start.timestamp && s.timestamp < end.timestamp
                            );
                            return !hasStartInBetween;
                        });
                        
                        if (correspondingEnd) {
                            const startX = xScale.getPixelForValue(start.timestamp);
                            const endX = xScale.getPixelForValue(correspondingEnd.timestamp);
                            
                            // Desenhar área sombreada verde
                            if (startX >= chartArea.left - 50 && endX >= chartArea.left && startX <= chartArea.right + 50) {
                                const clampedStartX = Math.max(startX, chartArea.left);
                                const clampedEndX = Math.min(endX, chartArea.right);
                                
                                if (clampedEndX > clampedStartX) {
                                    ctx.fillStyle = 'rgba(39, 174, 96, 0.1)'; // Verde transparente (igual bomba)
                                    ctx.fillRect(clampedStartX, chartArea.top, clampedEndX - clampedStartX, chartArea.bottom - chartArea.top);
                                }
                            }
                        }
                    });
                    
                    // Linhas verticais para TODOS os inícios (novos + legado)
                    const allStarts = [...starts, ...legacyArrivals].sort((a, b) => a.timestamp - b.timestamp);
                    allStarts.forEach((arrival, index) => {
                        const x = xScale.getPixelForValue(arrival.timestamp);
                        
                        if (x >= chartArea.left && x <= chartArea.right) {
                            // Linha vertical da COMPESA (início)
                            ctx.strokeStyle = 'blue';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([8, 4]);
                            ctx.beginPath();
                            ctx.moveTo(x, chartArea.top);
                            ctx.lineTo(x, chartArea.bottom);
                            ctx.stroke();
                            
                            // Verificar se deve mostrar o texto (distância > 100px da próxima chegada)
                            let showText = true;
                            if (index < allStarts.length - 1) {
                                const nextX = xScale.getPixelForValue(allStarts[index + 1].timestamp);
                                const distance = Math.abs(nextX - x);
                                if (distance <= 100) {
                                    showText = false;
                                }
                            }
                            
                            // Texto indicativo (apenas se houver espaço suficiente)
                            if (showText) {
                                ctx.fillStyle = 'blue';
                                ctx.font = 'bold 11px Arial';
                                ctx.textAlign = 'center';
                                
                                const textY = chartArea.top - 8;
                                ctx.fillText('💧 COMPESA', x, textY);
                            }
                        }
                    });
                    
                    // Linhas verticais para fim da água (cor mais clara, sem texto)
                    ends.forEach((end) => {
                        const x = xScale.getPixelForValue(end.timestamp);
                        
                        if (x >= chartArea.left && x <= chartArea.right) {
                            ctx.strokeStyle = 'rgba(52, 152, 219, 0.6)'; // Azul mais claro
                            ctx.lineWidth = 1;
                            ctx.setLineDash([4, 4]);
                            ctx.beginPath();
                            ctx.moveTo(x, chartArea.top);
                            ctx.lineTo(x, chartArea.bottom);
                            ctx.stroke();
                        }
                    });
                }
                
                // Linhas dos acionamentos da bomba
                if (this.showPumpEvents && this.pumpActivations.length) {
                    const activations = this.pumpActivations.filter(pump => pump.action === 'activated');
                    const deactivations = this.pumpActivations.filter(pump => pump.action === 'deactivated');
                    
                    
                    // Linhas verdes para acionamentos (ligar bomba)
                    activations.forEach((activation, index) => {
                        const x = xScale.getPixelForValue(activation.timestamp);
                        
                        if (x >= chartArea.left && x <= chartArea.right) {
                            // Linha vertical verde da bomba
                            ctx.strokeStyle = '#27ae60';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([5, 3]);
                            ctx.beginPath();
                            ctx.moveTo(x, chartArea.top);
                            ctx.lineTo(x, chartArea.bottom);
                            ctx.stroke();
                            
                            // Verificar se deve mostrar o texto (distância > 100px da próxima ativação)
                            let showText = true;
                            if (index < activations.length - 1) {
                                const nextX = xScale.getPixelForValue(activations[index + 1].timestamp);
                                const distance = Math.abs(nextX - x);
                                if (distance <= 100) {
                                    showText = false;
                                }
                            }
                            
                            // Ícone da bomba e texto lado a lado (apenas se houver espaço suficiente)
                            if (showText && this.pumpIconLoaded) {
                                const iconSize = 14;
                                const textY = chartArea.top - 22;
                                
                                // Calcular posições para centralizar ícone + texto
                                ctx.font = 'bold 9px Arial';
                                const textWidth = ctx.measureText('BOMBA').width;
                                const totalWidth = iconSize + 3 + textWidth; // ícone + gap + texto
                                
                                const startX = x - totalWidth / 2;
                                const iconX = startX;
                                const textX = startX + iconSize + 3;
                                
                                // Desenhar ícone
                                ctx.drawImage(this.pumpIcon, iconX, textY - iconSize + 2, iconSize, iconSize);
                                
                                // Desenhar texto
                                ctx.fillStyle = '#27ae60';
                                ctx.textAlign = 'left';
                                ctx.fillText('BOMBA', textX, textY-2);
                            }
                        }
                    });
                    
                    // Sombreamento entre acionamentos e desligamentos
                    activations.forEach((activation) => {
                        // Encontrar o desligamento correspondente
                        const correspondingDeactivation = deactivations.find(deact => 
                            deact.timestamp > activation.timestamp && 
                            deact.timestamp === activation.deactivated_at
                        );
                        
                        if (correspondingDeactivation) {
                            const startX = xScale.getPixelForValue(activation.timestamp);
                            const endX = xScale.getPixelForValue(correspondingDeactivation.timestamp);
                            
                            if (startX >= chartArea.left && endX <= chartArea.right && endX > startX) {
                                // Desenhar área sombreada
                                ctx.fillStyle = 'rgba(39, 174, 96, 0.1)'; // Verde transparente
                                ctx.fillRect(startX, chartArea.top, endX - startX, chartArea.bottom - chartArea.top);
                            }
                        }
                    });
                    
                    // Linhas vermelhas para desligamentos (sem texto)
                    deactivations.forEach((deactivation) => {
                        const x = xScale.getPixelForValue(deactivation.timestamp);
                        
                        if (x >= chartArea.left && x <= chartArea.right) {
                            // Linha vertical vermelha da bomba (desligamento)
                            ctx.strokeStyle = '#e74c3c';
                            ctx.lineWidth = 2;
                            ctx.setLineDash([3, 2]);
                            ctx.beginPath();
                            ctx.moveTo(x, chartArea.top);
                            ctx.lineTo(x, chartArea.bottom);
                            ctx.stroke();
                        }
                    });
                }
                
                ctx.restore();
            }
        };
        
        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Nível da Caixa (%)',
                    data: [],
                    backgroundColor: config.backgroundColor,
                    borderColor: config.borderColor,
                    borderWidth: config.borderWidth,
                    pointBackgroundColor: config.pointBackgroundColor,
                    pointBorderColor: config.pointBorderColor,
                    pointBorderWidth: config.pointBorderWidth,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            plugins: [verticalLinesPlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 30 // Espaço extra no topo para o texto da COMPESA
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                onClick: (event, elements) => {
                    if (this.isAdminMode) {
                        this.handleChartClick(event, elements);
                    }
                },
                elements: {
                    point: {
                        radius: 4,
                        hoverRadius: 6
                    }
                },
                plugins: {
                    title: {
                        display: false // Removido pois agora temos o título no HTML
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            modifierKey: isMobile ? null : 'shift',
                            onPanComplete: function({chart}) {
                                console.log('📱 Pan realizado');
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: isMobile ? true : false, // Desabilitar wheel zoom no desktop
                                speed: 0.3
                            },
                            drag: {
                                enabled: false
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                            scaleMode: 'x',
                            onZoomComplete: function({chart}) {
                                const device = isMobile ? 'mobile' : 'desktop';
                                console.log(`🔍 Zoom realizado no ${device}`);
                            }
                        },
                        limits: {
                            x: {min: 'original', max: 'original'},
                            y: {min: 0, max: 100}
                        }
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        align: 'center'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.9)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#3498db',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: (context) => {
                                const point = context[0];
                                return this.formatTooltipDate(new Date(point.parsed.x));
                            },
                            label: (context) => {
                                const value = context.parsed.y;
                                return `Nível: ${value.toFixed(1)}%`;
                            },
                            afterBody: (context) => {
                                const timestamp = context[0].parsed.x;
                                const datasetLabel = context[0].dataset.label;
                                
                                // Verificar se é um evento da COMPESA
                                const event = this.events.find(e => 
                                    Math.abs(e.timestamp - timestamp) < 300000
                                );
                                
                                if (event) {
                                    return ['', '🚰 Chegada da COMPESA', `Aumento: +${event.increase.toFixed(1)}%`];
                                }
                                
                                return [];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        title: {
                            display: true,
                            text: 'Tempo'
                        },
                        ticks: {
                            callback: (value) => {
                                const date = new Date(value);
                                return this.formatAxisDate(date);
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: false,
                            text: 'Nível (%)',
                            font: {
                                size: 14,
                                weight: 'bold'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });
    }

    // Forçar pontos pequenos
    forceSmallPoints() {
        if (this.chart && this.chart.data.datasets) {
            this.chart.data.datasets.forEach(dataset => {
                dataset.pointRadius = 4;
                dataset.pointHoverRadius = 6;
            });
            this.chart.update('none');
        }
    }

    // Atualizar dados do gráfico
    async updateChart(period = '24h') {
        this.currentPeriod = period;
        this.showLoading(true);

        try {
            // Buscar dados históricos
            this.data = await firebaseService.getHistoricalData(period);
            
            // Detectar eventos da COMPESA
            this.events = firebaseService.detectCompesaEvents(this.data);
            
            // Buscar chegadas da COMPESA do Firebase
            const allArrivals = await firebaseService.getCompesaArrivals(0); // 0 = todos os dados
            this.compesaArrivals = this.filterArrivalsByPeriod(allArrivals, period);
            
            // Debug: separar início e fim da água
            const starts = this.compesaArrivals.filter(c => !c.waterEnded);
            const ends = this.compesaArrivals.filter(c => c.waterEnded);
            console.log(`📊 COMPESA para ${period}: ${this.compesaArrivals.length} total (${starts.length} chegadas, ${ends.length} fins)`);

            // Buscar acionamentos da bomba
            this.pumpActivations = await firebaseService.getPumpActivations(period);
            console.log(`💧 Acionamentos da bomba encontrados para ${period}:`, this.pumpActivations.length);

            // Atualizar datasets
            this.updateDatasets();
            
            // Atualizar gráfico
            this.chart.update('active');
            
            // Resetar zoom ao mudar período
            this.resetZoom(true);
            
            // Garantir que os pontos permaneçam pequenos
            this.forceSmallPoints();
            
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
        } finally {
            this.showLoading(false);
        }
    }

    // Filtrar chegadas da COMPESA por período
    filterArrivalsByPeriod(arrivals, period) {
        if (!arrivals.length || period === 'all') return arrivals;
        
        const periodConfig = appConfig.periods[period];
        if (!periodConfig.hours) return arrivals;
        
        const now = Date.now();
        const startTime = now - (periodConfig.hours * 60 * 60 * 1000);
        
        return arrivals.filter(arrival => arrival.timestamp >= startTime);
    }

    // Atualizar datasets do gráfico
    updateDatasets() {
        const datasets = [];

        // Dataset principal (nível da água)
        datasets.push({
            label: 'Nível da Caixa (%)',
            data: this.data,
            backgroundColor: appConfig.chart.backgroundColor,
            borderColor: appConfig.chart.borderColor,
            borderWidth: appConfig.chart.borderWidth,
            pointBackgroundColor: this.data.map(point => this.getPointColor(point.y)),
            pointBorderColor: appConfig.chart.pointBorderColor,
            pointBorderWidth: appConfig.chart.pointBorderWidth,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.4
        });

        // Eventos da COMPESA
        if (this.showCompesaEvents && this.events.length > 0) {
            datasets.push({
                label: 'Chegadas da COMPESA',
                data: this.events.map(event => ({
                    x: event.timestamp,
                    y: event.newLevel
                })),
                backgroundColor: appConfig.chart.compesaEventColor,
                borderColor: appConfig.chart.compesaEventBorderColor,
                borderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 10,
                showLine: false,
                fill: false
            });
        }

        // Acionamentos da bomba são mostrados como linhas verticais via plugin

        // Linha de tendência
        if (this.showTrendLine && this.data.length > 1) {
            const trendData = this.calculateTrendLine();
            datasets.push({
                label: 'Tendência',
                data: trendData,
                borderColor: '#95a5a6',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
                tension: 0
            });
        }

        this.chart.data.datasets = datasets;
    }

    // Calcular linha de tendência
    calculateTrendLine() {
        if (this.data.length < 2) return [];

        const n = this.data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += this.data[i].y;
            sumXY += i * this.data[i].y;
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return [
            {
                x: this.data[0].x,
                y: intercept
            },
            {
                x: this.data[n - 1].x,
                y: intercept + slope * (n - 1)
            }
        ];
    }

    // Obter cor do ponto baseada no nível
    getPointColor(level) {
        const levels = appConfig.levels;
        if (level < levels.low) {
            return '#e74c3c'; // Vermelho - baixo
        } else if (level < levels.medium) {
            return '#f39c12'; // Laranja - médio
        } else {
            return '#27ae60'; // Verde - alto
        }
    }

    // Encontrar ponto de dados mais próximo de um timestamp
    findClosestDataPoint(timestamp) {
        if (!this.data.length) return null;
        
        let closest = this.data[0];
        let minDiff = Math.abs(this.data[0].x - timestamp);
        
        for (let i = 1; i < this.data.length; i++) {
            const diff = Math.abs(this.data[i].x - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = this.data[i];
            }
        }
        
        return closest;
    }

    // Toggle eventos da bomba
    togglePumpEvents(show) {
        this.showPumpEvents = show;
        this.updateDatasets();
        this.chart.update('active');
        console.log(`💧 Eventos da bomba: ${show ? 'mostrar' : 'ocultar'}`);
    }

    // Mostrar/ocultar loading
    showLoading(show) {
        const loading = document.getElementById('chartLoading');
        if (loading) {
            loading.style.display = show ? 'flex' : 'none';
        }
    }

    // Alternar exibição de eventos da COMPESA
    toggleCompesaEvents(show) {
        this.showCompesaEvents = show;
        this.updateDatasets();
        this.chart.update('active'); // Usar 'active' para redesenhar as linhas verticais
        this.forceSmallPoints();
    }

    // Alternar linha de tendência
    toggleTrendLine(show) {
        this.showTrendLine = show;
        this.updateDatasets();
        this.chart.update('none');
        this.forceSmallPoints();
    }

    // Formatar data para tooltip
    formatTooltipDate(date) {
        try {
            if (!date || isNaN(date.getTime())) {
                return 'Data inválida';
            }
            
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                weekday: 'short',
                timeZone: 'America/Sao_Paulo'
            }).format(date);
        } catch (error) {
            console.warn('Erro ao formatar data do tooltip:', error);
            return date.toLocaleString('pt-BR');
        }
    }

    // Formatar data para o eixo X
    formatAxisDate(date) {
        try {
            if (!date || isNaN(date.getTime())) {
                return '';
            }
            
            const now = new Date();
            const diffHours = (now - date) / (1000 * 60 * 60);
            
            if (diffHours < 24) {
                return date.toLocaleTimeString('pt-BR', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            } else if (diffHours < 168) {
                return date.toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: '2-digit',
                    year: 'numeric'
                });
            } else {
                return date.toLocaleDateString('pt-BR', { 
                    day: '2-digit',
                    month: '2-digit', 
                    year: 'numeric'
                });
            }
        } catch (error) {
            console.warn('Erro ao formatar data do eixo:', error);
            return '';
        }
    }

    // Redimensionar gráfico
    resize() {
        if (this.chart) {
            this.chart.resize();
        }
    }

    // Destruir gráfico
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        
        // Limpar event listeners customizados
        if (!this.isMobileDevice()) {
            document.removeEventListener('keydown', this.handleKeyDown);
            document.removeEventListener('keyup', this.handleKeyUp);
            this.canvas.removeEventListener('wheel', this.handleWheel);
        }
    }

    // Configurar controles de zoom
    setupZoomControls() {
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');
        const resetZoomBtn = document.getElementById('resetZoom');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.zoomIn());
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
        }

        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => this.resetZoom());
        }

        console.log('⚙️ Controles de zoom configurados');
    }

    // Configurar zoom customizado para desktop
    setupCustomZoom() {
        if (this.isMobileDevice()) {
            console.log('📱 Dispositivo móvel detectado - usando zoom nativo');
            return;
        }

        // Armazenar referências dos handlers para poder remover depois
        this.handleKeyDown = (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = true;
            }
        };

        this.handleKeyUp = (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = false;
            }
        };

        this.handleWheel = (e) => {
            if (this.shiftPressed && this.chart) {
                // Só interceptar se Shift estiver pressionado
                e.preventDefault();
                e.stopPropagation();
                
                // Capturar múltiplas propriedades do wheel event para debug
                const deltaY = e.deltaY || e.detail || e.wheelDelta;
                const wheelDelta = e.wheelDelta;
                const detail = e.detail;
                
                console.log(`🔍 Debug wheel event: deltaY=${e.deltaY}, wheelDelta=${wheelDelta}, detail=${detail}, computed=${deltaY}`);
                
                // Determinar direção do zoom com múltiplas verificações
                let zoomFactor;
                if (e.deltaY !== 0) {
                    zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
                } else if (e.wheelDelta !== undefined) {
                    zoomFactor = e.wheelDelta > 0 ? 1.2 : 0.8;
                } else if (e.detail !== undefined) {
                    zoomFactor = e.detail < 0 ? 1.2 : 0.8;
                } else {
                    console.warn('⚠️ Não foi possível determinar direção do scroll');
                    return;
                }
                
                console.log(`🔍 Zoom customizado: direção determinada, fator=${zoomFactor}`);
                
                // Aplicar zoom
                this.chart.zoom(zoomFactor);
            }
            // Se Shift não estiver pressionado, deixar o evento passar normalmente (scroll da página)
        };

        // Event listeners para detectar Shift
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        // Event listener para wheel no canvas (passive: false para poder usar preventDefault quando necessário)
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });

        console.log('⚙️ Zoom customizado configurado para desktop');
    }

    // Zoom in
    zoomIn() {
        if (this.chart) {
            this.chart.zoom(1.2);
            console.log('🔍 Zoom in aplicado');
        }
    }

    // Zoom out
    zoomOut() {
        if (this.chart) {
            this.chart.zoom(0.8);
            console.log('🔍 Zoom out aplicado');
        }
    }

    // Reset zoom
    resetZoom(auto = false) {
        if (this.chart) {
            this.chart.resetZoom();
            if (auto) {
                console.log('🔄 Zoom resetado automaticamente (mudança de período)');
            } else {
                console.log('🔄 Zoom resetado');
            }
        }
    }

    // Definir modo admin
    setAdminMode(isAdmin) {
        this.isAdminMode = isAdmin;
        console.log(`🔧 Modo admin do gráfico: ${isAdmin ? 'ativado' : 'desativado'}`);
        
        // Mostrar/ocultar instruções do modo admin
        const adminInstructions = document.getElementById('adminChartInstructions');
        if (adminInstructions) {
            adminInstructions.style.display = isAdmin ? 'block' : 'none';
        }
        
        // Configurar event listeners dos botões do card
        if (isAdmin) {
            this.setupMarkCardListeners();
        } else {
            this.hideMarkCard();
        }
    }

    // Configurar event listeners do card de marcação
    setupMarkCardListeners() {
        const confirmBtn = document.getElementById('confirmCompesaMark');
        const cancelBtn = document.getElementById('cancelCompesaMark');
        
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (this.selectedPoint) {
                    this.confirmCompesaMark();
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideMarkCard();
            });
        }
    }

    // Lidar com cliques no gráfico (modo admin)
    handleChartClick(event, elements) {
        if (!this.isAdminMode) return;

        // Obter posição do clique
        const canvasPosition = Chart.helpers.getRelativePosition(event, this.chart);
        const dataX = this.chart.scales.x.getValueForPixel(canvasPosition.x);
        const dataY = this.chart.scales.y.getValueForPixel(canvasPosition.y);

        console.log(`🖱️ Clique no gráfico - X: ${dataX}, Y: ${dataY}`);

        // Encontrar ponto mais próximo
        const closestPoint = this.findClosestDataPoint(dataX);
        
        if (closestPoint) {
            const clickedDate = new Date(closestPoint.x);
            const level = closestPoint.y;
            
            console.log(`📍 Ponto mais próximo: ${firebaseService.formatDateTime(clickedDate)} - ${level}%`);
            
            // Mostrar card para confirmar marcação
            this.showMarkCard(closestPoint, clickedDate, level);
        }
    }

    // Mostrar card para marcar chegada da COMPESA
    showMarkCard(dataPoint, date, level) {
        // Armazenar ponto selecionado
        this.selectedPoint = {
            dataPoint,
            date,
            level
        };
        
        // Calcular aumento
        const previousPoint = this.findPreviousDataPoint(dataPoint.x);
        const previousLevel = previousPoint ? previousPoint.y : level;
        const increase = Math.max(0, level - previousLevel);
        
        // Preencher dados do card
        const markCard = document.getElementById('compesaMarkCard');
        const dateTimeElement = document.getElementById('markDateTime');
        const levelElement = document.getElementById('markLevel');
        const increaseElement = document.getElementById('markIncrease');
        
        if (markCard && dateTimeElement && levelElement && increaseElement) {
            dateTimeElement.textContent = firebaseService.formatDateTime(date);
            levelElement.textContent = `${level.toFixed(1)}%`;
            increaseElement.textContent = `+${increase.toFixed(1)}%`;
            increaseElement.style.color = increase > 0 ? '#27ae60' : '#95a5a6';
            
            // Mostrar card com animação
            markCard.style.display = 'block';
        }
    }

    // Ocultar card de marcação
    hideMarkCard() {
        const markCard = document.getElementById('compesaMarkCard');
        if (markCard) {
            markCard.style.display = 'none';
        }
        this.selectedPoint = null;
    }

    // Confirmar marcação da COMPESA
    async confirmCompesaMark() {
        if (!this.selectedPoint) return;
        
        const { dataPoint, date, level } = this.selectedPoint;
        
        // Ocultar card
        this.hideMarkCard();
        
        // Executar marcação
        await this.markCompesaArrival(dataPoint, date, level);
    }

    // Marcar chegada da COMPESA manualmente
    async markCompesaArrival(dataPoint, date, level) {
        try {
            console.log(`🚰 Marcando chegada da COMPESA manualmente: ${firebaseService.formatDateTime(date)}`);
            
            // Encontrar nível anterior para calcular aumento
            const previousPoint = this.findPreviousDataPoint(dataPoint.x);
            const previousLevel = previousPoint ? previousPoint.y : level;
            const increase = Math.max(0, level - previousLevel);
            
            // Criar dados da chegada
            const arrivalData = {
                timestamp: dataPoint.x,
                date: firebaseService.formatDateTime(date),
                previous_level: Math.round(previousLevel * 10) / 10,
                new_level: Math.round(level * 10) / 10,
                increase: Math.round(increase * 10) / 10,
                datetime: firebaseService.formatDateTime(date),
                manual_mark: true,
                marked_by: 'admin',
                marked_at: Date.now()
            };
            
            // Salvar no Firebase
            const result = await firebaseService.saveManualCompesaArrival(arrivalData);
            
            if (result.success) {
                console.log('✅ Chegada da COMPESA marcada com sucesso');
                
                // Notificar o app principal para atualizar a interface
                if (window.app && typeof window.app.updateAfterManualCompesaMark === 'function') {
                    await window.app.updateAfterManualCompesaMark();
                }
                
                alert(`✅ Chegada da COMPESA marcada com sucesso!\n\nAumento: +${increase.toFixed(1)}%`);
            } else {
                throw new Error(result.error || 'Erro desconhecido');
            }
            
        } catch (error) {
            console.error('❌ Erro ao marcar chegada da COMPESA:', error);
            alert(`❌ Erro ao marcar chegada da COMPESA: ${error.message}`);
        }
    }

    // Encontrar ponto anterior para calcular aumento
    findPreviousDataPoint(timestamp) {
        if (!this.data.length) return null;
        
        let previousPoint = null;
        
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].x >= timestamp) {
                break;
            }
            previousPoint = this.data[i];
        }
        
        return previousPoint;
    }
}

console.log('✅ ChartManager definido com sucesso!');
