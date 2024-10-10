const d3 = require('d3');
const dscc = require('@google/dscc');
const local = require('./localMessage.js');

// Definir se estamos em desenvolvimento local
export const LOCAL = false;

// Função para obter o valor do estilo configurado pelo usuário
const styleVal = (message, styleId) => {
  if (typeof message.style[styleId].defaultValue === "object") {
    return message.style[styleId].value.color !== undefined
      ? message.style[styleId].value.color
      : message.style[styleId].defaultValue.color;
  }
  return message.style[styleId].value !== undefined
    ? message.style[styleId].value
    : message.style[styleId].defaultValue;
};

// Função para criar escalas X e Y (com eixo Y invertido)
const createScales = (data, chartWidth, chartHeight) => {
  const xScale = d3.scaleBand()
    .domain(data.map(d => d.temporalDimension[0]))  // Alterado para usar temporalDimension
    .range([0, chartWidth])  // Escala X começa no zero relativo ao gráfico
    .padding(0.2);  // Aumentar o padding entre as barras para evitar sobreposição

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data.map(d => d.metric[0]))])  // Alterado para usar metric de graphic1
    .range([0, chartHeight]);  // Inverte o eixo Y para que as barras cresçam de cima para baixo

  return { xScale, yScale };
};

// Função para desenhar os eixos
const drawAxes = (svg, xScale, yScale, chartHeight, chartWidth, margin) => {
  // Eixo X
  svg.append("g")
    .attr("transform", `translate(0, ${chartHeight})`)
    .call(d3.axisBottom(xScale));

  // Eixo Y
  svg.append("g")
    .attr("transform", `translate(0, 0)`)  // Posiciona o eixo Y corretamente
    .call(d3.axisLeft(yScale));
};

// Função para desenhar o gráfico de barras (de cima para baixo)
const drawBars = (svg, data, xScale, yScale, chartHeight, barColor) => {
  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", d => xScale(d.temporalDimension[0]))  // Corrigido para usar temporalDimension
    .attr("y", 0)  // Inicia as barras no topo
    .attr("width", xScale.bandwidth())  // Usa a largura correta das barras com base na escala
    .attr("height", d => yScale(d.metric[0]))  // As barras crescem para baixo, usando metric
    .attr("fill", barColor);
};

// Função principal para desenhar a visualização
const drawViz = (message) => {
  const margin = { left: 60, right: 20, top: 20, bottom: 40 };  // Aumentamos a margem à esquerda
  const height = dscc.getHeight() * 0.35;  // Ajusta para 35% da altura da tela
  const width = dscc.getWidth();

  const chartHeight = height - margin.top - margin.bottom;
  const chartWidth = width - margin.left - margin.right;

  // Limpar o SVG existente
  d3.select("body").selectAll("svg").remove();

  // Criar um novo SVG
  const svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // Obter os dados e escalas
  const data = message.tables.DEFAULT;
  const { xScale, yScale } = createScales(data, chartWidth, chartHeight);

  // Obter a cor selecionada pelo usuário para as barras
  const barColor = styleVal(message, "barColor");

  // Desenhar barras (de cima para baixo)
  drawBars(svg, data, xScale, yScale, chartHeight, barColor);

  // Desenhar eixos
  drawAxes(svg, xScale, yScale, chartHeight, chartWidth, margin);

  // Adicionar rótulos nas barras
  svg.selectAll("text")
    .data(data)
    .enter()
    .append("text")
    .attr("x", d => xScale(d.temporalDimension[0]) + xScale.bandwidth() / 2)  // Corrigido para temporalDimension
    .attr("y", d => yScale(d.metric[0]) + 15)  // Ajusta a posição dos rótulos
    .attr("text-anchor", "middle")
    .text(d => d.metric[0]);
};

// Renderização local ou produção
if (LOCAL) {
  drawViz(local.message);
} else {
  dscc.subscribeToData(drawViz, { transform: dscc.objectTransform });
}
