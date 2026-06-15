# S8-US07: Metricas de Servicos e Preparacao

## Epic
Servicos, Oficina, Prestadores e Notas Fiscais

## Objetivo
Gerar metricas sobre custos, prazos e performance de servicos/prestadores, conectando preparacao ao DRE e margem do veiculo.

## Historia de Usuario
**Como** Gestor/Administrador,
**quero** acompanhar metricas de preparacao e servicos,
**para** entender custo real, atrasos, prestadores mais usados e impacto na margem.

## Indicadores
- Custo previsto vs realizado por veiculo.
- Custo previsto vs realizado por OS.
- Tempo em oficina.
- Tempo medio por prestador.
- Servicos mais caros.
- Categorias com maior custo.
- Prestadores mais usados.
- Prestadores com mais atrasos.
- Impacto do custo na margem do veiculo.
- Ranking de veiculos com maior custo de preparacao.

## Filtros
- Periodo.
- Veiculo.
- Prestador.
- Categoria.
- Status.
- Tipo de operacao: proprio, consignado, repasse quando aplicavel.

## Criterios de Aceite
- Dado que existem OS com custos, quando abrir metricas, entao deve exibir previsto vs realizado.
- Dado que OS tem data de entrada e conclusao, quando abrir metricas, entao deve calcular tempo em oficina.
- Dado que custos estao vinculados ao veiculo, quando consultar DRE/margem, entao impacto deve aparecer.
- Dado que usuario filtra por prestador, quando aplicar, entao indicadores devem respeitar filtro.

## Fora de Escopo
- IA preditiva avancada.
- Ranking publico de prestadores.

## Observacoes Tecnicas
- Preparar dados para IA futura.
- Reaproveitar dados do DRE da Sprint 5.
