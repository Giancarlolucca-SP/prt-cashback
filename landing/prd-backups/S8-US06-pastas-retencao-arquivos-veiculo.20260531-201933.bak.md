# S8-US06: Pastas e Retencao de Arquivos do Veiculo

## Epic
Servicos, Oficina, Prestadores e Notas Fiscais

## Objetivo
Organizar arquivos por veiculo, com categorias documentais e regras de retencao/exclusao automatica conforme tipo de arquivo e status do veiculo.

## Historia de Usuario
**Como** Administrativo/Gestor,
**quero** que cada veiculo tenha uma pasta organizada,
**para** armazenar servicos, NFs, garantias, laudos e documentos com prazo de retencao definido.

## Estrutura Inicial
- Pasta do veiculo.
- Servicos realizados.
- NFs/recibos.
- Garantias.
- Laudos.
- Documentos.
- Fotos/evidencias.
- Contabilidade.

## Regras de Retencao
- Laudo cautelar deve ficar armazenado por 2 anos, com exclusao automatica apos o prazo quando permitido.
- Laudo de transferencia segue regra definida em sprint/documentacao propria ou configuracao administrativa.
- Arquivos operacionais de servicos/preparacao podem ter exclusao automatica apos 3 meses da venda/baixa do veiculo, se a politica da loja permitir.
- Documentos com exigencia legal, fiscal, garantia ou auditoria devem ter prazo proprio e nao seguir exclusao curta.
- Toda exclusao automatica deve gerar log.

## Criterios de Aceite
- Dado que arquivo e anexado ao veiculo, quando salvar, entao deve ficar em categoria/pasta correta.
- Dado que arquivo possui regra de retencao, quando prazo vencer, entao deve entrar em fila de exclusao automatica ou revisao conforme configuracao.
- Dado que laudo cautelar foi anexado, quando consultar metadados, entao deve mostrar retencao de 2 anos.
- Dado que exclusao automatica ocorre, quando auditar, entao deve existir log.

## Fora de Escopo
- Politica juridica definitiva de retencao para todos documentos.
- Armazenamento externo definitivo sem arquitetura definida.

## Observacoes Tecnicas
- Cada arquivo deve ter tipo documental, veiculo, origem, data, responsavel e prazo de retencao.
- Evitar exclusao de documentos legais sem regra explicita.
