# GitHub Workflow — crypto-AI

## Цель
Обеспечить единый прозрачный процесс работы команды:
SA + Dev + QA + PM + Tech Writer.

## Основной поток
1. Создаётся Issue
2. Issue попадает в Project
3. Выполняется анализ, если нужен
4. Задача переводится в Ready for Dev
5. Исполнитель создаёт branch
6. Выполняет коммиты
7. Создаёт Pull Request
8. Идёт review
9. После merge задача идёт в QA
10. После проверки задача переводится в Done
11. Документация обновляется при необходимости

## Правила
- Нет работы без Issue
- Нет merge без PR
- Нет Done без проверки
- Нет изменения логики без обновления документации

## Артефакты по ролям

### System Analyst
- analysis issues
- acceptance criteria
- business rules
- API contracts
- docs updates

### Developer
- branch
- commits
- PR
- implementation notes

### QA
- bug reports
- тестовые комментарии
- QA verification

### PM / РП
- priority
- sprint scope
- release control

### Tech Writer
- README updates
- docs updates
- Wiki updates
- release notes

## Definition of Ready
Задача может идти в Dev, если:
- понятна цель
- есть AC
- понятен scope
- известны зависимости

## Definition of Done
Задача done, если:
- реализация завершена
- PR смержен
- CI зелёный
- QA выполнено
- документация обновлена