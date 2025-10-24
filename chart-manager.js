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
        this.data = [];
        this.events = [];
        this.compesaArrivals = [];
        
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
        
        // Forçar tamanho pequeno dos pontos após inicialização
        this.forceSmallPoints();
    }

    // Inicializar gráfico
    initChart() {
        const config = appConfig.chart;
        
        // Plugin para desenhar linhas verticais da COMPESA
        const verticalLinesPlugin = {
            id: 'verticalLines',
            afterDraw: (chart) => {
                if (!this.showCompesaEvents || !this.compesaArrivals.length) {
                    console.log('🚫 Linhas verticais não desenhadas:', {
                        showCompesaEvents: this.showCompesaEvents,
                        arrivalsCount: this.compesaArrivals.length
                    });
                    return;
                }
                
                console.log('✅ Desenhando linhas verticais para', this.compesaArrivals.length, 'chegadas');
                
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const xScale = chart.scales.x;
                
                ctx.save();
                
                this.compesaArrivals.forEach((arrival, index) => {
                    const x = xScale.getPixelForValue(arrival.timestamp);
                    
                    if (x >= chartArea.left && x <= chartArea.right) {
                        // Linha vertical
                        ctx.strokeStyle = 'blue';
                        ctx.lineWidth = 1;
                        ctx.setLineDash([8, 4]);
                        ctx.beginPath();
                        ctx.moveTo(x, chartArea.top);
                        ctx.lineTo(x, chartArea.bottom);
                        ctx.stroke();
                        
                        // Texto indicativo
                        ctx.fillStyle = 'blue';
                        ctx.font = 'bold 11px Arial';
                        ctx.textAlign = 'center';
                        
                        // Alternar posição do texto para evitar sobreposição (dentro da área do gráfico)
                        const textY = chartArea.top - 8;
                        ctx.fillText('💧 COMPESA', x, textY);
                        
                        // // Adicionar informação do aumento
                        // if (arrival.increase) {
                        //     ctx.font = '9px Arial';
                        //     ctx.fillText(`+${arrival.increase.toFixed(1)}%`, x, textY + 12);
                        // }
                    }
                });
                
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
                            modifierKey: null,
                            onPanComplete: function({chart}) {
                                console.log('📱 Pan realizado');
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.1
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x',
                            onZoomComplete: function({chart}) {
                                console.log('🔍 Zoom realizado');
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
            console.log(`📊 Chegadas da COMPESA encontradas para ${period}:`, this.compesaArrivals.length);

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
}

console.log('✅ ChartManager definido com sucesso!');
