
const fs = require('fs');
const path = require('path');




function getModuleDetailByName(moduleName) {
  const modules = {
    frontend: ` - README.md
  - index.html
  - jsconfig.json
  - package-lock.json
  - package.json
  - **public**
    - robots.txt
  - rollup.config.js
  - **src**
    - RootApp.jsx
    - **apps**
      - ErpApp.jsx
      - **Header**
        - HeaderContainer.jsx: "This file defines a React component named HeaderContent for a web application's header section. It uses several libraries, including react-redux for state management, react-router-dom for navigation"
        - UpgradeButton.jsx: "Showing upgade button"
      - IdurarOs.jsx : "including HeaderContainer and AppRouter here "
      - **Navigation**
        - NavigationContainer.jsx: "Left navigation item addeded here like dashboard,customer,invoice,quote,payment,paymentMode,taxes,generalSettings,about"
    - **auth**
      - auth.service.js: "Auth service is having login,register,verify,resetPassword,logout these function  axios to use backend api "
      - index.js: "exporting auth service export * from './auth.service"
    - **components**
      - **AutoCompleteAsync**
        - index.jsx: "this component is designed to provide a flexible and efficient autocomplete input field with asynchronous data fetching and optional redirection capabilities."
      - **CollapseBox**
        - index.jsx: "The CollapseBox component is a React component designed to manage and display collapsible content sections. It includes a button to toggle between expanded and collapsed states. "
      - **CreateForm**
        - index.jsx:"This file defines a CreateForm component in React, which handles form submissions using Redux for state management and Ant Design for UI elements. It includes logic for handling file uploads, resetting form fields upon successful submission, and translating button text."
      - **CrudModal**
        - index.jsx: "This file defines a DeleteModal component using React and Ant Design's Modal. It handles the deletion of items by dispatching Redux actions and manages modal visibility and loading states through context and selectors."
      - **DataTable**
        - DataTable.jsx: "This file defines a \`DataTable\` component in React that utilizes Ant Design components and Redux for state management. It provides functionalities for displaying, searching, and performing CRUD operations on a data table, with additional context-based actions like opening modals and panels."
      - **DeleteModal**
        - index.jsx: "The \`DeleteModal\` component in this file is a React functional component that uses Redux and context hooks to manage the state and actions for a delete confirmation modal. It handles displaying a confirmation message, executing a delete action, and updating the UI based on the success of the delete operation."
      - **IconMenu**
        - index.jsx: "This file defines an \`IconMenu\` component that dynamically selects and renders an icon from the Ant Design library based on the provided \`name\` prop. If the \`name\` is not specified or doesn't match any available icons, it defaults to the \`DesktopOutlined\` icon."
      - **Loading**
        - index.jsx: "This file defines a \`Loading\` component using Ant Design's \`Spin\` and \`LoadingOutlined\` icon. It displays a loading spinner when \`isLoading\` is true, wrapping any child components passed to it."
      - **MoneyInputFormItem**
        - index.jsx: "This file defines a \`MoneyInputFormItem\` component using React and Ant Design. It formats and displays a monetary input field with customizable currency symbols and precision, leveraging a custom \`useMoney\` hook for currency settings."
      - **MultiStepSelectAsync**
        - index.jsx: "This file defines a \`MultiStepSelectAsync\` React component that provides a two-step selection process using Ant Design's \`Select\` component. It fetches options asynchronously based on the selected values and handles errors using a custom error handler."
      - **NotFound**
        - index.jsx: "This file defines a \`NotFound\` React component that displays a 404 error message using Ant Design's \`Result\` component. It includes a button that navigates the user back to the homepage, with all text translated using a custom \`useLanguage\` hook."
      - **Notification**
        - index.jsx: "This React component, \`Notifications\`, displays a list of notifications with delete buttons. Users can remove notifications from the list by clicking the delete icon next to each notification."
      - **PageLoader**
        - index.jsx: "This file defines a \`PageLoader\` React component that uses Ant Design's \`Spin\` component with a custom loading icon (\`LoadingOutlined\`). The loader is styled to be centered absolutely on the page."
      - **ReadItem**
        - index.jsx: "This React component, \`ReadItem\`, displays a list of items with their labels and values in a formatted layout using Ant Design's \`Row\` and \`Col\` components. It fetches data from a Redux store and formats date values using \`dayjs\`, updating the display based on the component's state and configuration."
      - **SearchItem**
        - index.jsx: "This file defines a \`SearchItemComponent\` that uses a debounced search input to query and display selectable search results from a Redux store. The \`SearchItem\` component manages the rendering of \`SearchItemComponent\` instances, triggering re-renders when necessary."
      - **SelectAsync**
        - index.jsx: "This file defines a \`SelectAsync\` React component that asynchronously fetches and displays a list of options using the Ant Design \`Select\` component. It supports optional redirection and custom label display, with options styled using tags and colors."
      - **SelectTag**
        - index.jsx: "This file defines a \`SelectTag\` component using Ant Design's \`Select\` and \`Tag\` components. It maps over the provided \`options\` to render each as a selectable option, using \`shortid\` to generate unique keys for each option."
      - **SidePanel**
        - index.jsx: "This file defines a \`SidePanel\` component using React and Ant Design's \`Drawer\` component. It manages the panel's open/close state and animations, and includes a collapsible content section using a \`CollapseBox\` component."
      - **TabsContent**
        - TabsContent.jsx: "This file defines a \`TabsContent\` component using Ant Design's \`Tabs\`, \`Row\`, and \`Col\` components. It structures a tabbed interface with a customizable right-side menu and settings layout, allowing for dynamic content and a specified default active tab."
      - **Tag**
        - index.jsx: "This file defines a \`StatusTag\` component using React and Ant Design's \`Tag\` component. It assigns a color based on the status prop and translates the status text using a custom hook, \`useLanguage\`."
      - **UpdateForm**
        - index.jsx: "This file defines an \`UpdateForm\` component in React, which handles form submissions and updates using Redux for state management. It includes functionality for handling file uploads, formatting date fields with \`dayjs\`, and managing UI state transitions with context actions."
      - **Visibility**
        - index.jsx: "The \`Visibility\` component in this file is a React functional component that conditionally renders its children based on the \`isOpen\` prop. It applies inline styles to toggle the display and opacity of the content between visible and hidden states."
      - **outsideClick.js**
        - demo.js: "This file defines a React component \`App\` that renders a simple interface with two dropdown menus for selecting a vegetable and a fruit. It uses the \`useState\` hook to manage the selected values and renders the component into the DOM using \`ReactDOM.render\`."
        - index.js: "This file defines a \`Dropdown\` component using React hooks. It manages the dropdown's open/close state and handles clicks both inside and outside the component to toggle its visibility."
    - **config**
      - serverApiConfig.js: "This configuration file sets up various base URLs for API, website, and file access, dynamically adjusting them based on the environment (production or development). It also defines a constant for the access token name used in authentication."
    - **context**
      - **adavancedCrud**
        - actions.jsx: "This file defines a set of context actions for managing the state of various UI panels and modals in a React application. It uses a dispatch function to trigger state changes based on action types imported from a separate file."
        - index.jsx: "This file defines a React context for managing advanced CRUD operations. It provides a context provider and a custom hook to access state, actions, and selectors related to the CRUD operations."
        - reducer.jsx: "This file defines a reducer function for managing the state of a CRUD interface, handling actions to open and close modals and panels. It uses an initial state and updates the state based on action types imported from a separate file."
        - selectors.jsx: "This file defines a \`contextSelectors\` function that returns an object with methods to check the open state of UI components (\`isModalOpen\`, \`isPanelOpen\`, \`isBoxOpen\`) based on the application's state. It exports this function as the default export."
        - types.jsx: "This file defines a set of string constants representing different action types for managing UI components, such as modals and panels, in a React application. These constants are used to ensure consistency and avoid typos in action type strings across the application."
      - **appContext**
        - actions.jsx: "This file defines a \`contextActions\` function that returns an object with methods to dispatch actions for managing navigation menu states and application states. It uses action types imported from a separate \`types\` module to handle opening, closing, and collapsing the navigation menu, as well as changing and resetting the application state."
        - index.jsx: "This file defines a React context for managing global state in an application. It provides a context provider component (\`AppContextProvider\`) and a custom hook (\`useAppContext\`) to access and manipulate the state using actions."
        - reducer.jsx
        - types.jsx
      - **crud**
        - actions.jsx
        - index.jsx
        - reducer.jsx
        - selectors.jsx
        - types.jsx
      - **erp**
        - actions.jsx
        - index.jsx
        - reducer.jsx
        - selectors.jsx
        - types.jsx
      - **profileContext**
        - actions.jsx
        - index.jsx
        - reducer.jsx
        - selectors.jsx
        - types.jsx
    - favicon.ico
    - **forms**
      - AdminForm.jsx: "This file defines an \`AdminForm\` component using Ant Design's form elements, which includes fields for user details like name, email, and role, with conditional rendering for password input. It also includes a file upload validation function, though the upload feature is currently commented out."
      - AdvancedSettingsForm.jsx: "This file defines a React component \`AdvancedSettingsForm\` using Ant Design components to create a form for managing advanced settings. It includes dynamic form fields for different setting types, such as text, number, date, and select options, with localization support and conditional rendering based on the selected type."
      - CurrencyForm.jsx:"This file defines a React component \`CurrencyForm\` using Ant Design components to create a form for inputting currency details, including name, symbol, separators, and a default currency toggle."
      - CustomerForm.jsx:"This file defines a \`CustomerForm\` component using Ant Design's \`Form\` and \`Input\` components, with validation rules for company, manager names, phone, and email fields, including custom validation for empty strings and phone number format."
      - **DynamicForm**
        - index.jsx: "This file defines a \`DynamicForm\` component that dynamically renders form elements based on the provided \`fields\` configuration. It includes various input types and components, such as \`Select\`, \`Input\`, and \`DatePicker\`, with support for translations and feedback handling."
      - EmployeeForm.jsx: "This file defines an \`EmployeeForm\` component using Ant Design's form elements, which includes fields for personal and contact information, with validation rules and localization support."
      - ForgetPasswordForm.jsx: "This file defines a React component \`ForgetPasswordForm\` that renders an email input field with validation rules using Ant Design, and utilizes a translation hook for the placeholder text."
      - InventoryForm.jsx: "This file defines a React component \`InventoryForm\` using Ant Design's form elements to capture product details, including product name, quantity, and unit price, with validation rules for each field."
      - LeadForm.jsx: "This file defines a \`LeadForm\` component using Ant Design's \`Form\`, \`Input\`, and \`Select\` components, with fields for personal and company information, translated labels, and validation rules."
      - LoginForm.jsx: "This file defines a \`LoginForm\` component using React and Ant Design, which includes email and password input fields, a "Remember me" checkbox, and a "Forgot password" link, with support for localization."
      - OrderForm.jsx: "This file defines a React component \`OrderForm\` using Ant Design components to create a form for managing order details, including fields for order ID, products, quantity, price, status, and notes, with validation for required fields and non-empty strings."
      - PaymentForm.jsx: "This file defines a \`PaymentForm\` component in React using Ant Design, which includes form fields for number, date, amount, payment mode, reference, and description, with localization and currency formatting support."
      - PaymentModeForm.jsx: This file defines a React component \`PaymentModeForm\` that uses Ant Design components to create a form for managing payment modes, including fields for name, description, and toggle switches for enabling and setting a default mode, with support for localization.
      - RegisterForm.jsx: "This file defines a \`RegisterForm\` component using React and Ant Design, which includes fields for name, email, password, and country selection, with localization support."
      - ResetPasswordForm.jsx: "This file defines a \`ResetPasswordForm\` component using React and Ant Design, which includes password and confirm password fields with validation to ensure the passwords match."
      - TaxForm.jsx: "This file defines a React component \`TaxForm\` using Ant Design components to create a form for inputting tax details, including name, value, and toggle switches for enabling and setting a default status, with localization support."
      - UpdateEmail.jsx
    - **hooks**
      - useDebounce.jsx: The \`useDebounce\` hook delays the execution of a function until after a specified delay period has passed since the last time it was invoked, using dependencies to reset the delay.
      - useFetch.jsx: "This file defines a custom React hook, \`useFetch\`, which manages the state of data fetching operations, including loading, success, and error states, by utilizing another hook, \`useFetchData\`."
      - useMail.jsx: "This React hook, \`useMail\`, provides a function to send mail data to a Redux action and tracks the loading state from the Redux store."
      - useNetwork.jsx: "This file defines a custom React hook,\`useNetwork\`, that tracks the network status and connection properties of the user's device, updating the state when the network goes online, offline, or changes."
      - useOnFetch.jsx: "This React hook, \`useOnFetch\`, manages the state of a fetch operation, including the result, success status, and loading state."
      - useResponsive.jsx: "This file defines a custom React hook, \`useResponsive\`, that tracks and provides the current screen size and a mobile status based on configurable breakpoints, updating subscribers on window resize events."
      - useTimeoutFn.jsx: "This custom React hook, \`useTimeoutFn\`, manages a timeout function that can be set, cleared, and checked for readiness, automatically updating when the function or delay changes."
    - **layout**
      - **AuthLayout**
        - index.jsx : "This file defines a React component \`AuthLayout\` that uses Ant Design's \`Layout\`, \`Row\`, and \`Col\` components to structure a two-column layout, with customizable side content and main content areas."
      - **CrudLayout**
        - index.jsx: "This file defines a \`CrudLayout\` component that uses a \`DefaultLayout\` and a \`SidePanel\`, managing the side panel's open/close state with context and effects, and rendering children within a styled \`ContentBox\`."
      - **DashboardLayout**
        - index.jsx: "This file defines a \`DashboardLayout\` component in React that uses Ant Design's \`Layout\` and applies a left margin to its children."
      - **DefaultLayout**
        - index.jsx: "This file defines a \`DefaultLayout\` component that wraps its children with a \`CrudContextProvider\` to provide CRUD context functionality."
      - **ErpLayout**
        - index.jsx: "This file defines the \`ErpLayout\` component, which wraps its children with an \`ErpContextProvider\` and styles the content using Ant Design's \`Layout.Content\`."
      - **Footer**
        - index.jsx: "This file defines and exports a React functional component that renders a footer using Ant Design's \`Layout.Footer\` with centered text."
      - **ProfileLayout**
        - index.jsx: "This file defines a \`ProfileLayout\` component that wraps its children with a \`ProfileContextProvider\` to provide profile-related context to its descendants."
      - **SettingsLayout**
        - index.jsx : "This file defines a \`SettingsLayout\` component using React and Ant Design, which structures a layout with a customizable top card and content area."
      - index.jsx : "This file exports default components from various layout modules, making them available for import in other parts of the application."
    - **locale**
      - Localization.jsx: "This file defines a \`Localization\` component that wraps its children with an Ant Design \`ConfigProvider\` to apply a custom theme."
      - antdLocale.js: "This file imports the English (US) locale from Ant Design and exports it as part of an object for use in the application."
      - coreTranslation.js : "This file defines and exports an array containing a single string, \`'en_us'\`, which likely represents a supported language code for localization purposes."
      - **translation**
        - en_us.js :"This file contains a JavaScript object that maps English language keys to their corresponding translation strings for a web application's user interface."
        - otherTranslation.js : "This file defines an empty \`languages\` object and exports it as the default export."
        - translation.js : "This file imports English (US) translations and exports them as part of a \`languages\` object."
      - useLanguage.jsx : "This file defines a \`useLanguage\` hook that provides a \`translate\` function to convert a given key into a human-readable label, storing and retrieving translations from local storage if not found."
    - logo-icon.svg
    - main.jsx
    - **modules**
      - **AuthModule**
        - SideContent.jsx: "This React component, \`SideContent\`, renders a styled content section with a logo, title, and descriptive text for an open-source ERP/CRM application using Ant Design."
        - index.jsx :"This file defines an \`AuthModule\` React component that uses an \`AuthLayout\` to display authentication-related content, including a logo, title, and additional content, with language translation support."
      - **CrudModule**
        - CrudModule.jsx: "This file defines a \`CrudModule\` component that manages CRUD operations with a layout including a header panel, side panels for item creation and updates, and a data table, utilizing Redux for state management and Ant Design for UI components."
      - **DashboardModule**
        - **components**
          - CustomerPreviewCard.jsx: "This file defines a \`CustomerPreviewCard\` React component that displays customer statistics, including a progress dashboard and active customer count, with loading and translation support."
          - PreviewCard.jsx: "This file defines a \`PreviewCard\` component in React that displays a progress overview of various statuses, with customizable statistics and loading states, using Ant Design components."
          - **RecentTable**
            - index.jsx: "This file defines a \`RecentTable\` component that displays a table with actions for reading, editing, and downloading records, using Ant Design components and Redux for state management."
          - SummaryCard.jsx: "This file defines a React component \`AnalyticSummaryCard\` that displays a summary card with a title, prefix, and formatted data, using Ant Design components and Redux for state management."
        - index.jsx: "The \`DashboardModule\` component fetches and displays summary statistics for invoices, quotes, payments, and clients using various cards and tables, with data formatted according to user-selected currency settings."
      - **ErpPanelModule**
        - CreateItem.jsx: " This file defines a React component \`CreateItem\` that manages the creation of items in an ERP system, handling form submission, state updates, and navigation using Redux and Ant Design components."
        - DataTable.jsx : "This file defines a \`DataTable\` component in a React application, which displays a paginated table with CRUD operations and additional actions using Ant Design components and Redux for state management."
        - DeleteItem.jsx : "This file defines a React component that manages a modal for deleting items, handling the display of item details and dispatching delete actions using Redux."
        - ItemRow.jsx: "This file defines a React component \`ItemRow\` that manages and displays form fields for item details, including name, description, quantity, price, and total, with functionality to update and remove items using Ant Design components."
        - ReadItem.jsx : "This file defines a React component \`ReadItem\` that displays detailed information about an ERP item, including client details, item list, and financial statistics, with options to edit, download, email, or convert the item."
        - SearchItem.jsx: "This file defines a React component that provides an auto-complete search feature, integrating with Redux for state management and using Ant Design components for the UI."
        - UpdateItem.jsx: "This file defines a React component \`UpdateItem\` that manages the state and form submission for updating ERP items, utilizing Redux for state management and Ant Design for UI components."
        - index.jsx: "This file defines the \`ErpPanel\` component, which uses React hooks to manage state and effects, and renders a data table and a delete modal within an ERP context."
      - **InvoiceModule**
        - **CreateInvoiceModule**
          - index.jsx: "This file defines a \`CreateInvoiceModule\` component that uses an \`ErpLayout\` to render a \`CreateItem\` component with an \`InvoiceForm\` for creating invoices."
        - **Forms**
          - InvoiceForm.jsx: "This file defines an \`InvoiceForm\` component in React that manages invoice details, including client information, invoice number, year, status, date, expiration date, and itemized entries, while dynamically calculating totals and taxes using Ant Design components and Redux state."
        - **InvoiceDataTableModule**
          - index.jsx : "This file defines a React component \`InvoiceDataTableModule\` that renders an ERP layout with a panel, including an option to record payments, using localization and an icon."
        - **ReadInvoiceModule**
          - index.jsx : "This file defines a React component, \`ReadInvoiceModule\`, which fetches and displays invoice data using Redux, showing a loader during data retrieval and rendering either the invoice details or a "Not Found" message based on the fetch result."
        - **RecordPaymentModule**
          - **components**
            - Payment.jsx : "This file defines a React component \`Payment\` that displays payment details and actions for a specific entity, using Ant Design components and hooks for state management and navigation."
            - RecordPayment.jsx : "This React component, \`RecordPayment\`, manages the recording of payments for invoices, handling form submission, state updates, and navigation using Redux and Ant Design."
          - index.jsx: "This file defines a React component, \`RecordPaymentModule\`, which manages the state and rendering of a payment recording interface using Redux for state management and React Router for parameter handling."
        - **UpdateInvoiceModule**
          - index.jsx : "This file defines a React component, \`UpdateInvoiceModule\`, which manages the update process for an invoice, including data fetching, loading states, and rendering the appropriate form or error message."
      - **PaymentModule**
        - **PaymentDataTableModule**
          - index.jsx: "This file defines a React component \`PaymentDataTableModule\` that renders an \`ErpLayout\` containing an \`ErpPanel\` with a given configuration."
        - **ReadPaymentModule**
          - **components**
            - ReadItem.jsx : "This React component, \`ReadItem\`, displays detailed payment information for a selected item, including client details and financial statistics, with options to edit, download, or email the invoice."
          - index.jsx : "This file defines a React component that fetches and displays payment module data using Redux, showing a loader while data is being retrieved."
        - **UpdatePaymentModule**
          - **components**
            - Payment.jsx : "This React component, \`Payment\`, displays and updates payment details for a client, utilizing Ant Design components and hooks for state management and navigation."
            - UpdatePayment.jsx : "This file defines a React component for updating payment details, utilizing form handling, state management, and navigation within a Redux-based application."
          - index.jsx : "This file defines a React component, \`UpdatePaymentModule\`, which manages the state and rendering of a payment update interface, utilizing Redux for state management and React Router for parameter handling."
      - **ProfileModule**
        - **components**
          - AdminInfo.jsx : "This file defines the \`AdminInfo\` component, which displays the current admin's profile information and provides buttons for editing details, updating the password, and logging out."
          - PasswordModal.jsx : "This file defines a \`PasswordModal\` component in React using Ant Design, which allows users to update their password with form validation and handles the submission process through a context and custom hooks."
          - Profile.jsx : "This file defines a \`Profile\` component that uses context to conditionally render \`AdminInfo\`, \`UpdateAdmin\`, and a \`PasswordModal\` based on the application's state."
          - ProfileAdminForm.jsx
          - UpdateAdmin.jsx
          - UploadImg.jsx
        - index.jsx
      - **QuoteModule**
        - **CreateQuoteModule**
          - index.jsx
        - **Forms**
          - QuoteForm.jsx
        - **QuoteDataTableModule**
          - index.jsx
        - **ReadQuoteModule**
          - index.jsx
        - **UpdateQuoteModule**
          - index.jsx
      - **SettingModule**
        - **CompanyLogoSettingsModule**
          - **forms**
            - AppSettingForm.jsx
          - index.jsx
        - **CompanySettingsModule**
          - SettingsForm.jsx
          - index.jsx
        - **FinanceSettingsModule**
          - SettingsForm.jsx
          - index.jsx
        - **GeneralSettingsModule**
          - **forms**
            - GeneralSettingForm.jsx
          - index.jsx
        - **MoneyFormatSettingsModule**
          - SettingsForm.jsx
          - index.jsx
        - **components**
          - SetingsSection.jsx
          - UpdateSettingForm.jsx
          - UpdateSettingModule.jsx
    - **pages**
      - About.jsx: "About page providing information about the application and its features."
      - **Customer**
        - config.js:  "Configuration for customer page, including fields like name, country, phone, and email."
        - index.jsx:  "Utilizes config.js to build a dynamic form for adding new customers."
      - Dashboard.jsx: "Loads the Dashboard module from DashboardModule/index.jsx.",
      - ForgetPassword.jsx: "Page for password recovery."
      - **Invoice**
        - InvoiceCreate.jsx:  "Loads CreateInvoiceModule with specific configurations."
        - InvoiceRead.jsx:  "Loads ReadInvoiceModule with specific configurations.",
        - InvoiceRecordPayment.jsx: "Loads RecordPaymentModule with specific configurations."
        - InvoiceUpdate.jsx:"Loads UpdateInvoiceModule with specific configurations."
        - index.jsx: "Displays a table of invoices with columns such as Number, Client, Date, Expiry Date, Total, Paid, Status, and Payment."
      - Login.jsx: "User login page."
      - Logout.jsx: "User logout page."
      - NotFound.jsx: "Page displayed when a route is not found."
      - **Payment**
        - PaymentRead.jsx: "Loads ReadPaymentModule with specific configurations."
        - PaymentUpdate.jsx: "Loads UpdatePaymentModule with specific configurations."
        - index.jsx: "Displays a table of payments with columns such as Number, Client, Amount, Date, Year, and Payment Mode."
      - **PaymentMode**
        - index.jsx: "Displays a table of payment modes with columns such as Payment Mode, Description, Default, Enabled, and includes a search textbox, refresh button, and add payment mode button."
      - Profile.jsx: "Loads the Profile Module."
      - **Quote**
        - QuoteCreate.jsx: "Loads CreateQuoteModule with specific configurations."
        - QuoteRead.jsx: "Loads ReadQuoteModule with specific configurations."
        - QuoteUpdate.jsx: "Loads UpdateQuoteModule with specific configurations."
        - index.jsx: "Displays a table of quotes with columns such as Client, Date, Expiry Date, Sub Total, Total, and Status, using QuoteDataTableModule."
      - ResetPassword.jsx: "Form for resetting passwords.
      - **Settings**
        - CompanyLogoSettings.jsx: "Loads CompanyLogoSettingsModule with specific configurations."
        - CompanySettings.jsx:"Loads CompanySettingsModule with specific configurations."
        - FinanceSettings.jsx:: "Loads FinanceSettingsModule with specific configurations."
        - GeneralSettings.jsx: "Loads GeneralSettingsModule with specific configurations."
        - MoneyFormatSettings.jsx: "Loads MoneyFormatSettingsModule with specific configurations."
        - Settings.jsx: "TabsContent to load various settings modules including CompanyLogoSettings, CompanySettings, FinanceSettings, GeneralSettingsModule, and MoneyFormatSettings."
      - **Taxes**
        - index.jsx: "Displays a table of quotes with columns such as Name Value Default Enabled"
    - **redux**
      - **adavancedCrud**
        - actions.js
        - index.js
        - reducer.js
        - selectors.js
        - types.js
      - **auth**
        - actions.js
        - index.js
        - reducer.js
        - selectors.js
        - types.js
      - **crud**
        - actions.js
        - index.js
        - reducer.js
        - selectors.js
        - types.js
      - **erp**
        - actions.js
        - index.js
        - reducer.js
        - selectors.js
        - types.js
      - rootReducer.js
      - **settings**
        - actions.js
        - index.js
        - reducer.js
        - selectors.js
        - types.js
      - store.js
      - storePersist.js
    - **request**
      - checkImage.js
      - codeMessage.js
      - errorHandler.js
      - index.js
      - request.js
      - successHandler.js
    - **router**
      - AppRouter.jsx
      - AuthRouter.jsx
      - routes.jsx
    - **settings**
      - index.jsx
      - useDate.jsx
      - useMoney.jsx
    - **style**
      - app.css
      - **images**
        - checklist.svg
        - fitbit-gray.svg
        - flow-xo-gray.svg
        - gitlab-gray.svg
        - idurar-crm-erp.svg
        - layar-gray.svg
        - logo-icon.png
        - logo-icon.svg
        - logo-menu.png
        - logo-text.png
        - logo-text.svg
        - logo.png
        - logo.svg
        - logo1.png
        - logo2.png
        - logo3.png
        - logo4.png
        - photo.png
      - **partials**
        - auth.css
        - collapseBox.css
        - core.css
        - customAntd.css
        - erp.css
        - header.css
        - layout.css
        - navigation.css
        - rest.css
        - sidePanel.css
        - transition.css
    - **utils**
      - calculate.js
      - color.js
      - countryList.js
      - currencyList.js
      - dataStructure.jsx
      - helpers.js
      - isBrowser.js
      - statusTagColor.js
      - tagColor.js
      - valueType.js
  - temp.env
  - vite.config.js`,
    backend: `- jsconfig.json
- package-lock.json
- package.json
- **src**
  - app.js
  - **controllers**
    - **appControllers**
      - **clientController**
        - index.js
        - summary.js
      - index.js
      - **invoiceController**
        - create.js
        - index.js
        - paginatedList.js
        - read.js
        - remove.js
        - schemaValidate.js
        - sendMail.js
        - summary.js
        - update.js
      - **paymentController**
        - create.js
        - index.js
        - remove.js
        - sendMail.js
        - summary.js
        - update.js
      - **paymentModeController**
        - index.js
      - **quoteController**
        - convertQuoteToInvoice.js
        - create.js
        - index.js
        - paginatedList.js
        - read.js
        - sendMail.js
        - summary.js
        - update.js
      - **taxesController**
        - index.js
    - **coreControllers**
      - **adminAuth**
        - index.js
      - **adminController**
        - index.js
      - **settingController**
        - index.js
        - listAll.js
        - listBySettingKey.js
        - readBySettingKey.js
        - updateBySettingKey.js
        - updateManySetting.js
      - setup.js
    - **middlewaresControllers**
      - **createAuthMiddleware**
        - authUser.js
        - checkAndCorrectURL.js
        - forgetPassword.js
        - index.js
        - isValidAuthToken.js
        - login.js
        - logout.js
        - resetPassword.js
        - sendMail.js
      - **createCRUDController**
        - create.js
        - filter.js
        - index.js
        - listAll.js
        - paginatedList.js
        - read.js
        - remove.js
        - search.js
        - summary.js
        - update.js
      - **createUserController**
        - index.js
        - read.js
        - updatePassword.js
        - updateProfile.js
        - updateProfilePassword.js
    - **pdfController**
      - index.js
  - **emailTemplate**
    - SendEmailTemplate.js
    - emailVerfication.js
  - **handlers**
    - **downloadHandler**
      - downloadPdf.js
    - errorHandlers.js
  - helpers.js
  - **locale**
    - languages.js
    - **translation**
      - en_us.js
    - useLanguage.js
  - **middlewares**
    - **inventory**
      - generateUniqueNumber.js
      - index.js
    - serverData.js
    - **settings**
      - increaseBySettingKey.js
      - index.js
      - listAllSettings.js
      - listBySettingKey.js
      - loadSettings.js
      - readBySettingKey.js
      - updateBySettingKey.js
    - **uploadMiddleware**
      - DoSingleStorage.js
      - LocalSingleStorage.js
      - index.js
      - singleStorageUpload.js
      - **utils**
        - LocalfileFilter.js
        - fileFilterMiddleware.js
  - **models**
    - **appModels**
      - Client.js
      - Invoice.js
      - Payment.js
      - PaymentMode.js
      - Quote.js
      - Taxes.js
    - **coreModels**
      - Admin.js
      - AdminPassword.js
      - Setting.js
      - Upload.js
    - **utils**
      - index.js
  - **pdf**
    - Invoice.pug
    - Offer.pug
    - Payment.pug
    - Quote.pug
  - **public**
    - **uploads**
      - **admin**
        - idurar-icon-png-80-i1kez.png
      - **setting**
        - company-logo.png
  - **routes**
    - **appRoutes**
      - appApi.js
    - **coreRoutes**
      - coreApi.js
      - coreAuth.js
      - coreDownloadRouter.js
      - corePublicRouter.js
  - server.js
  - **settings**
    - index.js
    - useAppSettings.js
    - useDate.js
    - useMoney.js
  - **setup**
    - **defaultSettings**
      - appSettings.json
      - clientSettings.json
      - companySettings.json
      - financeSettings.json
      - invoiceSettings.json
      - moneyFormatSettings.json
      - quoteSettings.json
    - reset.js
    - setup.js
    - setupConfig.json
  - **utils**
    - countryList.js
    - currency.js
    - currencyList.js
`
  };

  if (modules[moduleName]) {

    return [false, modules[moduleName]]

  } else {
    throw new Error(`Module with name '${moduleName}' not found.`);
  }
}

module.exports={
  getModuleDetailByName
}





































// function generateTreeJson(dirPath) {
//   const items = fs.readdirSync(dirPath).sort();
//   const tree = {};

//   items.forEach(item => {
//     if (item === 'node_modules' || item.startsWith('.')) return;
//     const itemPath = path.join(dirPath, item);

//     if (fs.statSync(itemPath).isDirectory()) {
//       tree[item] = generateTreeJson(itemPath);
//     } else {
//       tree[item] = null;
//     }
//   });

//   return tree;
// }

// function writeTreeToJson(dirPath, outputFile = 'idurar-erp-crm.json') {
//   const treeJson = generateTreeJson(dirPath);
//   fs.writeFileSync(outputFile, JSON.stringify(treeJson, null, 2));
// }

// // Usage
// writeTreeToJson('/Users/ravirawat/Desktop/idurar-erp-crm');

