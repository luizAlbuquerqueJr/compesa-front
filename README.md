# 🚰 Dashboard Monitor Caixa D'Água

Dashboard web para visualização em tempo real dos dados do sensor de caixa d'água ESP8266 com Firebase.

## 📊 Funcionalidades

### 🎯 **Principais**
- **Nível Atual**: Exibição em tempo real do nível da caixa
- **Gráfico Histórico**: Visualização de dados com diferentes escalas de tempo
- **Detecção COMPESA**: Identificação automática de chegadas de água
- **Estatísticas**: Métricas e análises dos dados coletados
- **Responsivo**: Interface adaptável para desktop e mobile

### 📈 **Gráfico Interativo**
- **Escalas de Tempo**: 24h, 7 dias, 30 dias, todos os dados
- **Eventos COMPESA**: Marcação visual das chegadas de água
- **Linha de Tendência**: Análise de padrões de consumo
- **Tooltips**: Informações detalhadas ao passar o mouse
- **Cores Inteligentes**: Verde (alto), amarelo (médio), vermelho (baixo)

### 📋 **Histórico de Eventos**
- Lista cronológica das chegadas da COMPESA
- Detalhes de cada evento (horário, aumento de nível)
- Tempo relativo (há X horas/dias)

### 📊 **Estatísticas**
- **Última COMPESA**: Quando foi a última chegada de água
- **Próxima Prevista**: Estimativa baseada no padrão (48h)
- **Nível Médio**: Média dos últimos 7 dias
- **Total de Eventos**: Contador de chegadas detectadas

## 🛠️ Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Gráficos**: Chart.js
- **Backend**: Firebase Realtime Database
- **Hospedagem**: GitHub Pages
- **Responsivo**: CSS Grid/Flexbox

## 🚀 Como Usar

### 📋 **Pré-requisitos**
1. Projeto Firebase configurado
2. ESP8266 enviando dados para Firebase
3. Regras do Firebase configuradas para leitura pública

### 🔧 **Configuração**

1. **Edite o arquivo `config.js`**:
```javascript
const firebaseConfig = {
    apiKey: "sua-api-key",
    databaseURL: "https://seu-projeto.firebaseio.com",
    // ... outras configurações
};
```

2. **Estrutura de Dados Esperada**:
```json
{
  "sensor_readings": {
    "2025-01-08": {
      "1641234567890": {"p": 72.5}
    }
  },
  "latest": {
    "percentage": 72.5,
    "timestamp": "1641234567890",
    "updated_at": "08/01/2025 às 14:30"
  }
}
```

### 🌐 **Deploy no GitHub Pages**

1. **Criar repositório no GitHub**
2. **Upload dos arquivos**:
   ```
   index.html
   styles.css
   config.js
   firebase-service.js
   chart-manager.js
   app.js
   README.md
   ```
3. **Ativar GitHub Pages**:
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)

4. **Acessar**: `https://seu-usuario.github.io/seu-repositorio`

## 📁 Estrutura do Projeto

```
compesa-esp8266-dashboard/
├── index.html              # Página principal
├── styles.css              # Estilos e responsividade
├── config.js               # Configurações Firebase e app
├── firebase-service.js     # Serviços de dados
├── chart-manager.js        # Gerenciamento de gráficos
├── app.js                  # Aplicação principal
└── README.md              # Documentação
```

## 🎨 Personalização

### 🎯 **Cores e Temas**
Edite `styles.css` para personalizar:
- Gradientes de fundo
- Cores dos cartões
- Paleta de cores do gráfico

### ⚙️ **Configurações**
Edite `config.js` para ajustar:
- Intervalos de atualização
- Thresholds de níveis
- Configurações do gráfico
- Períodos de tempo

### 📊 **Gráfico**
Personalize em `chart-manager.js`:
- Tipos de gráfico
- Animações
- Tooltips
- Escalas de tempo

## 🔄 Atualizações Automáticas

- **Nível atual**: A cada 30 segundos
- **Gráfico**: A cada 2 minutos
- **Estatísticas**: Junto com o gráfico
- **Pausa inteligente**: Para quando a aba não está visível

## 📱 Responsividade

- **Desktop**: Layout completo com sidebar
- **Tablet**: Layout adaptado
- **Mobile**: Interface otimizada para toque
- **Orientação**: Suporte a portrait e landscape

## 🐛 Troubleshooting

### ❌ **Dados não carregam**
1. Verificar configuração do Firebase
2. Verificar regras de segurança
3. Verificar console do navegador
4. Verificar estrutura de dados

### ❌ **Gráfico não aparece**
1. Verificar se Chart.js carregou
2. Verificar dados no Firebase
3. Verificar console para erros

### ❌ **GitHub Pages não funciona**
1. Verificar se repositório é público
2. Verificar configurações do Pages
3. Aguardar propagação (até 10 minutos)

## 📈 Próximas Funcionalidades

- [ ] Alertas por email/SMS
- [ ] Exportação de dados (CSV/PDF)
- [ ] Comparação entre períodos
- [ ] Previsão de consumo
- [ ] Modo escuro
- [ ] PWA (Progressive Web App)

## 📄 Licença

MIT License - Livre para uso pessoal e comercial.

---

**🔗 Links Úteis:**
- [Firebase Console](https://console.firebase.google.com)
- [GitHub Pages](https://pages.github.com)
- [Chart.js Docs](https://www.chartjs.org/docs/)
