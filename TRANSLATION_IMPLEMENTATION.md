# Translation Implementation Guide (POS System)

This document provides a comprehensive technical overview of the translation architecture in the POS System, covering frontend UI labels, backend messages, and dynamic database content.

---

## 1. Frontend: Static UI Translations

The frontend uses the industry-standard `@ngx-translate` library to handle static labels (buttons, headers, navigation, etc.).

### Core Components
- **Library:** `@ngx-translate/core` and `@ngx-translate/http-loader`.
- **Storage:** Translation files are located in `front/public/i18n/*.json` (e.g., `en.json`, `es.json`, `ca.json`, `de.json`, `zh-CN.json`, `hi.json`).
- **Service:** `LanguageService` (`front/src/app/services/language.service.ts`) acts as a wrapper around `@ngx-translate/core`.

### Initialization
In `front/src/app/app.config.ts`, the `TranslateModule` is initialized with a `TranslateHttpLoader` that fetches JSON files from the `/i18n/` path.

### Language Detection & Persistence
1. **Persistence:** The selected language code is stored in `localStorage` under the key `pos_language`.
2. **Detection:** Upon initialization, the system checks:
   - `localStorage` first.
   - Browser's `navigator.language` second.
   - Fallback to `en` (English) third.
3. **Normalization:** The `normalizeLanguageCode` method handles variants (e.g., `es-MX` or `es_ES` are both mapped to `es`, while `zh-Hans` is mapped to `zh-CN`).

### Usage in Templates
Static text is rendered using the `translate` pipe or directive:
```html
<h1>{{ 'DASHBOARD.TITLE' | translate }}</h1>
```

---

## 2. Backend: Message Localization

The backend (FastAPI) handles localized error and success messages for API responses.

### Message Definitions
Static messages are defined in `back/app/messages.py` as a nested dictionary:
```python
MESSAGES = {
    "en": {"incorrect_username_or_password": "Incorrect email or password", ...},
    "es": {"incorrect_username_or_password": "Email o contraseña incorrectos", ...},
    ...
}
```

### Language Resolution
The language is determined in `back/app/main.py` via the `_get_requested_language` dependency:
1. **Query Parameter:** `?lang=es` takes highest priority.
2. **Header:** `Accept-Language` header (e.g., `es;q=1.0, en;q=0.5`) is parsed.
3. **Fallback:** Defaults to `en`.

### Normalization
The backend uses `back/app/language_service.py` to normalize language codes, ensuring consistency with the frontend (e.g., converting `zh_CN` to `zh-CN`).

---

## 3. Database: Dynamic Content Translations (I18nText)

For dynamic content like product names, descriptions, or category names, the system uses a database-backed `I18nText` model.

### Database Schema (`I18nText` Model)
Defined in `back/app/models.py`:
- `entity_type`: String identifier (e.g., `"product"`, `"tenant"`, `"product_catalog"`).
- `entity_id`: ID of the record being translated.
- `field`: The specific field name (e.g., `"name"`, `"description"`).
- `lang`: Language code (e.g., `"es"`, `"zh-CN"`).
- `text`: The translated content.
- `tenant_id`: 
    - If `NULL`: Global/base translation (shared by all).
    - If set: Tenant-specific override.

### Translation Service
`back/app/translation_service.py` provides the logic for fetching translations with a fallback mechanism:
1. Try **Tenant-specific** translation.
2. Try **Global** translation.
3. Return the **canonical value** from the main table if no translation exists.

### Management API
The backend provides dedicated endpoints in `back/app/main.py` for managing these translations:
- `GET /i18n/{entity_type}/{entity_id}`: Retrieves all available translations for an entity.
- `PUT /i18n/{entity_type}/{entity_id}`: Updates or creates translations for specific fields and languages.

---

## 4. Summary of Supported Languages

The following languages are currently supported across the stack:
- **en:** English (Default)
- **es:** Español
- **ca:** Català
- **de:** Deutsch
- **zh-CN:** 中文 (简体)
- **hi:** हिन्दी

---

## 5. Implementation Flow Example

1. **User Change:** User selects "Español" in `LanguagePickerComponent`.
2. **Frontend Update:** `LanguageService` calls `translate.use('es')`, updating UI labels and setting `localStorage`.
3. **API Requests:** Frontend includes `Accept-Language: es` in headers via the `authInterceptor` (indirectly via `LanguageService.getAcceptLanguageHeader`).
4. **Backend Response:** 
   - Backend detects `es` and returns localized error messages from `messages.py`.
   - Backend fetches localized product names from the `I18nText` table using `TranslationService`.
## 6. How to Add a New Language

To add support for a new language (e.g., French - `fr`):

### 1. Frontend Setup
1. Create `front/public/i18n/fr.json` and translate the labels.
2. In `front/src/app/services/language.service.ts`, add the new language to the `SUPPORTED_LANGUAGES` array:
   ```typescript
   { code: 'fr', label: 'Français', locale: 'fr-FR' }
   ```

### 2. Backend Setup
1. In `back/app/language_service.py`, add `'fr'` to the `SUPPORTED_LANGUAGES` list.
2. In `back/app/messages.py`, add a new key `"fr"` to the `MESSAGES` dictionary and translate the strings.

### 3. Database Content
1. Use the `PUT /i18n/{entity_type}/{entity_id}` endpoint to add French translations for products, categories, etc.
2. (Optional) Update `back/seed_translations.py` to include default translations for the new language.
