
# CONTRIBUTING

Этот документ описывает правила работы с репозиторием crypto-AI.

Обязателен для:
- System Analyst
- Developer
- QA
- PM / РП
- Tech Writer

---

## 1. Общие принципы

- Вся работа ведётся через GitHub Issues
- Любые изменения попадают в защищённые ветки только через Pull Request
- Нет задачи → нет разработки
- Нет PR → нет merge
- Документация обновляется вместе с изменением логики
- Любая задача должна быть понятна по GitHub-артефактам без устных пояснений

---

## 2. Основной workflow

1. Создаётся Issue
2. Issue попадает в GitHub Project
3. Аналитик уточняет требования и AC
4. Задача переводится в Ready for Dev
5. Исполнитель создаёт branch
6. Делает коммиты
7. Создаёт Pull Request
8. Проходит review
9. После merge задача идёт в QA
10. После проверки переводится в Done
11. README / docs / Wiki обновляются при необходимости

---

## 3. Naming веток

Формат:
`<type>/<issue-id>-<short-description>`

Разрешённые типы:
- feature
- bugfix
- hotfix
- chore
- docs
- refactor
- test
- spike

Примеры:
- feature/123-add-buy-signal-cache
- bugfix/245-fix-404-dashboard
- docs/310-update-api-overview
- spike/401-research-pionex-rate-limit

Правила:
- branch всегда связан с Issue
- branch должен быть коротким и читаемым
- нельзя использовать имена `fix`, `test`, `new-branch`, `work`

---

## 4. Naming задач (Issues)

Формат:
`[Type] Краткое описание`

Типы:
- Feature
- Bug
- Task
- Tech Debt
- Docs
- Spike

Примеры:
- [Feature] Добавить кеширование сигналов покупки
- [Bug] Исправить 404 при обновлении dashboard
- [Task] Подготовить API contract для markets
- [Docs] Обновить README по локальному запуску
- [Spike] Исследовать staged scan для Pionex

---

## 5. Что должно быть в Issue

Обязательные блоки:
- Контекст / проблема
- Цель
- Описание ожидаемого результата
- Acceptance Criteria
- Ограничения / assumptions
- Связанные ссылки

Если это баг:
- шаги воспроизведения
- ожидаемое поведение
- фактическое поведение
- окружение
- скриншоты / логи

Если это аналитическая задача:
- бизнес-контекст
- участники
- входные и выходные данные
- интеграции / API / ограничения
- риски и edge cases

---

## 6. Правила коммитов

Формат:
`<type>(optional-scope): краткое описание`

Типы:
- feat
- fix
- docs
- refactor
- test
- chore
- ci
- perf

Примеры:
- feat(api): add signal cache warmup
- fix(web): prevent dashboard 404 on refresh
- docs(readme): update local setup
- refactor(bot): split signal formatter

Правила:
- один коммит = одно логическое изменение
- не использовать vague-сообщения: `fix`, `update`, `changes`, `final`
- сообщение должно быть понятно без открытия diff

---

## 7. Pull Request

Каждый PR обязан:
- ссылаться на Issue
- быть оформлен по шаблону
- содержать понятное описание изменений
- описывать способ проверки
- описывать риски / impact
- отражать границы scope

Нельзя:
- смешивать несвязанные изменения
- открывать PR без описания
- мержить черновой PR

---

## 8. Review и роли

### Developer
Ревьюит:
- код
- архитектуру
- интеграции
- CI / build / dependencies

### System Analyst
Ревьюит:
- соответствие требованиям
- бизнес-логику
- API-контракты
- пользовательские сценарии
- изменения в docs по логике

### QA
Ревьюит:
- тестируемость
- сценарии проверки
- edge cases
- критичные bugfix PR

### Tech Writer
Ревьюит:
- README
- docs
- release notes
- инструкции и Wiki-related changes

### PM / РП
Контролирует:
- приоритет
- scope
- готовность к спринту / релизу

---

## 9. Условия для merge

Merge запрещён, если:
- нет связанного Issue
- PR не заполнен по шаблону
- CI не прошёл
- нет required approval
- есть нерешённые комментарии
- не обновлена документация там, где это требуется

Минимум для merge:
- 1 approval
- зелёный CI
- resolved conversations

Для критичных изменений:
- 2 approvals
- review code owner
- review аналитика или QA по контексту

---

## 10. Где хранится документация

### README.md
Содержит:
- что это за проект
- как запустить
- структуру репозитория
- карту документации

### /docs
Содержит:
- архитектуру
- API
- бизнес-правила
- процессы
- ADR
- deployment / infra docs

### Wiki
Содержит:
- onboarding
- glossary
- инструкции для ролей
- базу знаний
- troubleshooting
- FAQ
- high-level overview

### Issues / PR
Содержат:
- обсуждение конкретной задачи
- решение по изменению
- историю согласований

---

## 11. Статусы в GitHub Project

Используются:
- Backlog
- Ready for Analysis
- Ready for Dev
- In Progress
- In Review
- Ready for QA
- In QA
- Done
- Blocked

Правила:
- статус обновляет текущий исполнитель
- Blocked всегда с причиной
- Done только после проверки agreed criteria

---

## 12. Ownership

### README
Владелец:
- repo owner / tech lead

Обновляют:
- разработчики при изменении setup / run / deploy / env
- аналитик при изменении high-level описания
- tech writer при редактуре текста

### /docs
Владельцы:
- architecture — tech lead + system analyst
- api — backend + system analyst
- business rules — system analyst
- processes — system analyst + PM
- user/admin guides — tech writer
- troubleshooting — dev + QA

### Wiki
- структуру ведёт system analyst / tech writer
- содержимое обновляют владельцы доменов

### Project
- статус обновляет текущий исполнитель

---

## 13. Definition of Done

Задача считается завершённой, если:
- реализована логика
- выполнены Acceptance Criteria
- PR смержен
- CI зелёный
- QA выполнено
- документация обновлена
- статус в Project актуален

---

## 14. Запрещено

- push напрямую в main
- merge без review
- PR без Issue
- PR без описания
- закрытие задачи без проверки
- устные договорённости без фиксации в GitHub