# Requirements Document

## 1. Application Overview

**Application Name**: AdvoCal Web CRM

**Description**: AdvoCal Web CRM is a standalone web-based legal case management application built with React + Vite + TypeScript. It serves advocates, law firms, junior advocates, clerks, and administrators. The application shares the same Supabase database as the existing AdvoCal mobile app and focuses on hearings, case tracking, calendar management, CNR extraction, client management, team collaboration, and subscription management. The UI design clones the exact layout and visual style from the provided screenshot (https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260621/file_000000008a78722f82777c2936bd9b42.png).

## 2. Users and Usage Scenarios

**Target Users**:
- Advocates
- Law Firms
- Junior Advocates
- Clerks
- Firm Administrators
- Super Administrators

**Core Usage Scenarios**:
- Managing legal cases and hearings
- Tracking client information and communication
- Organizing case documents and evidence
- Scheduling and monitoring hearing dates
- Collaborating with team members
- Extracting case details using CNR number
- Generating reports and analytics
- Managing subscriptions and billing

## 3. Page Structure and Functionality

### 3.1 Page Hierarchy

```
AdvoCal Web CRM
├── Login Page
└── Main Application
    ├── Dashboard (Default Home)
    ├── CLIENTS
    │   ├── Contacts
    │   ├── Companies
    │   └── Leads
    ├── MATTERS
    │   ├── Matters
    │   ├── Tasks
    │   └── Activities
    ├── COMMUNICATION
    │   ├── Messages
    │   ├── Emails
    │   └── Calls
    ├── MANAGEMENT
    │   ├── Documents
    │   ├── Calendar
    │   └── Reminders
    ├── REPORTS
    │   ├── Reports
    │   └── Analytics
    ├── Hearings
    ├── CNR Extraction
    ├── Team Management
    ├── Advocate Profile
    ├── Subscription
    └── Settings
```

### 3.2 UI Design System

**Layout Structure**:
- Left sidebar: dark navy background, white text, grouped navigation sections
- Top header: white background, global search bar, \"+ Add New\" blue button, notification bell icon, email icon, settings icon
- Main content area: light gray background (#F5F7FA)
- Cards: white background, rounded corners (16px), soft shadows

**Color Palette**:
- Primary Blue: #4285F4 / #1A56DB (Google Blue)
- Green: #34A853
- Red: #EA4335
- Yellow: #FBBC05
- Background: #F5F7FA

**Typography**:
- Font Family: Inter
- Bold headings, compact typography

**Branding**:
- Logo: AdvoCal CRM with scales icon displayed in sidebar

### 3.3 Left Sidebar Navigation

**Navigation Groups** (exact structure from screenshot):

**CLIENTS**:
- Contacts
- Companies
- Leads

**MATTERS**:
- Matters
- Tasks
- Activities

**COMMUNICATION**:
- Messages
- Emails
- Calls

**MANAGEMENT**:
- Documents
- Calendar
- Reminders

**REPORTS**:
- Reports
- Analytics

**Bottom Section**:
- User profile card with avatar, name, role

### 3.4 Top Header

**Components**:
- Global search bar
- \"+ Add New\" button (blue, #4285F4)
- Notification bell icon
- Email icon
- Settings icon
- User avatar

### 3.5 Login Page

**Functionality**:
- User login with email and password
- Validate user credentials
- Redirect to Dashboard after successful authentication

### 3.6 Dashboard (Default Home)

**Top KPI Cards** (4 cards in row):
- Total Cases
- Active Cases
- Upcoming Hearings
- Revenue This Month

**Matters Pipeline Section**:
- Kanban board with 5 columns:
  + New Inquiry
  + Consultation
  + In Progress
  + Awaiting Outcome
  + Closed
- Display matter cards with title, client name, status

**Upcoming Activities Feed**:
- Display list of upcoming tasks and activities
- Show activity type, description, due date

**Recent Contacts Table**:
- Display recent client contacts
- Show contact name, company, email, phone, last interaction date

**Matters by Practice Area Chart**:
- Donut chart showing distribution of matters by practice area
- Practice areas: Civil, Criminal, Family, Corporate, Tax, Other

### 3.7 Contacts (CLIENTS)

**Contact List Display**:
- Display all contacts in table format
- Show contact name, company, email, phone, linked cases count

**Search and Filter**:
- Search contacts by name, email, phone
- Filter by contact type, company

**Contact Profile View**:
- Display contact details: name, email, phone, address, company
- Display linked cases list
- Display communication log
- Display notes section
- Display invoices list

**Contact Actions**:
- Add new contact
- Edit contact details
- Delete contact
- Add note
- Link case

### 3.8 Companies (CLIENTS)

**Company List Display**:
- Display all companies in table format
- Show company name, industry, contact person, email, phone, linked contacts count

**Company Profile View**:
- Display company details: name, industry, address, contact person
- Display linked contacts list
- Display linked cases list
- Display notes section

**Company Actions**:
- Add new company
- Edit company details
- Delete company

### 3.9 Leads (CLIENTS)

**Lead List Display**:
- Display all leads in table format
- Show lead name, company, email, phone, status, source, created date

**Lead Status**:
- New
- Contacted
- Qualified
- Converted
- Lost

**Lead Actions**:
- Add new lead
- Edit lead details
- Convert lead to contact
- Delete lead

### 3.10 Matters (MATTERS)

**Matter List Display**:
- Display all matters in table format
- Show case title, case number, CNR, client, court, judge, filing date, hearing date, status

**Matter Status**:
- New Inquiry
- Consultation
- In Progress
- Awaiting Outcome
- Closed

**Search and Filter**:
- Search matters by case title, case number, CNR, client name
- Filter by status, court, judge, practice area

**Matter Detail View**:
- Display case details: case title, case number, CNR, client, opponent, court, judge, room number, filing date, hearing date, status
- Display notes section
- Display linked documents
- Display hearing timeline
- Display tasks list
- Display activities log

**Matter Actions**:
- Add new matter
- Edit matter details
- Delete matter
- Add hearing
- Upload document
- Add task
- Add note

### 3.11 Tasks (MATTERS)

**Task List Display**:
- Display all tasks in table format
- Show task title, assigned to, due date, priority, status, linked matter

**Task Status**:
- Pending
- In Progress
- Completed
- Overdue

**Task Priority**:
- High
- Medium
- Low

**Task Actions**:
- Add new task
- Edit task details
- Mark task as completed
- Delete task

### 3.12 Activities (MATTERS)

**Activity Feed Display**:
- Display all activities in chronological order
- Show activity type, description, user, timestamp, linked matter

**Activity Types**:
- Case Created
- Hearing Scheduled
- Document Uploaded
- Task Completed
- Note Added
- Status Changed

### 3.13 Messages (COMMUNICATION)

**Message Inbox**:
- Display list of message threads
- Show sender name, subject, preview, timestamp, unread indicator

**Message Detail View**:
- Display full message content
- Display message thread history
- Reply to message

**Message Actions**:
- Compose new message
- Reply to message
- Delete message

### 3.14 Emails (COMMUNICATION)

**Email Inbox**:
- Display list of emails
- Show sender name, subject, preview, timestamp, unread indicator

**Email Detail View**:
- Display full email content
- Display email thread history
- Reply to email

**Email Actions**:
- Compose new email
- Reply to email
- Forward email
- Delete email

### 3.15 Calls (COMMUNICATION)

**Call Log Display**:
- Display all call records in table format
- Show contact name, phone number, call type, duration, timestamp, notes

**Call Types**:
- Incoming
- Outgoing
- Missed

**Call Actions**:
- Log new call
- Edit call details
- Delete call record

### 3.16 Documents (MANAGEMENT)

**Document Library Display**:
- Display all documents in grid or list view
- Show document name, type, size, upload date, linked matter

**Document Types**:
- PDF
- Petition
- Order
- Evidence
- Judgment
- Hearing Document

**Search and Filter**:
- Search documents by name
- Filter by document type, linked matter, upload date

**Document Actions**:
- Upload new document
- Download document
- Delete document
- Link document to matter

### 3.17 Calendar (MANAGEMENT)

**Calendar Views**:
- Monthly view
- Weekly view
- Daily agenda view

**Hearing Indicators**:
- Display hearings on calendar with color-coded status
- Show hearing time, court, judge, case title

**Filter Options**:
- Filter by court
- Filter by judge
- Filter by status

**Calendar Actions**:
- Add new hearing
- Edit hearing details
- Delete hearing
- Navigate between dates

### 3.18 Reminders (MANAGEMENT)

**Reminder List Display**:
- Display all reminders in table format
- Show reminder title, due date, time, priority, status, linked matter

**Reminder Status**:
- Pending
- Completed
- Overdue

**Reminder Actions**:
- Add new reminder
- Edit reminder details
- Mark reminder as completed
- Delete reminder

### 3.19 Reports (REPORTS)

**Report Types**:
- Case Growth Report
- Hearing Trend Report
- Client Growth Report
- Revenue Report
- Advocate Productivity Report

**Report Display**:
- Display report title and description
- Display report filters: date range, practice area, advocate
- Display report data in charts and tables

**Report Actions**:
- Generate report
- Export report

### 3.20 Analytics (REPORTS)

**Analytics Dashboard**:
- Display key metrics: Total Cases, Active Cases, Completed Cases, Total Clients, Team Members, Monthly Revenue, Subscription Count
- Display charts: Monthly Hearings Trend (Line Chart), Case Type Distribution (Pie Chart), Revenue Trend (Bar Chart)
- Display tables: Upcoming Hearings, Recent Activities, Pending Tasks

### 3.21 Hearings

**Hearing Tabs**:
- Today Hearings
- Upcoming Hearings
- Missed Hearings
- Completed Hearings

**Hearing List Display**:
- Display hearings in table format
- Show case name, court, judge, room number, date, time, status

**Hearing Timeline**:
- Display chronological list of all hearings for a case
- Show hearing date, court, judge, outcome, notes

**Hearing Actions**:
- Add new hearing
- Edit hearing details
- Mark hearing as completed
- Delete hearing

### 3.22 CNR Extraction

**CNR Input Section**:
- CNR number input field
- Extract button

**Extraction Process**:
- Fetch case details using CNR number
- Display extracted details: case title, case number, court, judge, filing date, parties
- Create case automatically with extracted details

**Extraction History**:
- Display list of previous CNR extractions
- Show CNR number, extraction date, case title, status

### 3.23 Team Management

**Team Member List Display**:
- Display all team members in table format
- Show member name, email, role, status, joined date

**User Roles**:
- Super Admin
- Firm Admin
- Advocate
- Junior Advocate
- Clerk

**Role Permissions**:
- Define module-level access permissions for each role

**Team Actions**:
- Add new team member
- Edit member details
- Change member role
- Deactivate member
- Delete member

### 3.24 Advocate Profile

**Profile Display**:
- Display advocate photo
- Display advocate name
- Display BAR registration number
- Display contact details: email, phone, address
- Display chamber details
- Display QR code for digital visiting card

**Profile Actions**:
- Edit profile details
- Upload profile photo
- Share digital visiting card

### 3.25 Subscription

**Subscription Details**:
- Display current plan: ₹49/month
- Display subscription status: Active, Trial, Expired
- Display trial period: 7 days
- Display start date, end date, remaining days

**Billing History**:
- Display list of past payments
- Show payment date, amount, status, invoice

**Subscription Actions**:
- Upgrade plan
- Renew subscription
- Cancel subscription
- Download invoice

**Payment Integration**:
- Razorpay recurring subscription

### 3.26 Settings

**Profile Settings**:
- Edit user profile details
- Change password

**Notification Settings**:
- Enable or disable hearing reminders
- Enable or disable case update notifications
- Enable or disable subscription alerts

**Firm Settings** (for Firm Admin):
- Edit firm name
- Edit firm address
- Edit firm contact details

## 4. Business Rules and Logic

### 4.1 User Authentication and Authorization

**Login Validation**:
- Validate user credentials against Supabase database
- Redirect to Dashboard after successful login

**Role-Based Access Control**:
- Super Admin: Full access to all modules
- Firm Admin: Access to firm management, team management, subscription management
- Advocate: Access to cases, hearings, clients, documents, calendar
- Junior Advocate: Limited access to assigned cases and tasks
- Clerk: Access to document management, calendar, reminders

### 4.2 Database Connection

**Supabase Integration**:
- Connect to existing Supabase database shared with AdvoCal mobile app
- Database tables: Users, Firms, Cases, Hearings, Clients, Documents, Tasks, Notifications, Payments, Subscriptions, Audit Logs

### 4.3 Matter Pipeline Logic

**Status Progression**:
- New Inquiry → Consultation → In Progress → Awaiting Outcome → Closed
- Allow manual status change by user

### 4.4 Hearing Status Logic

**Hearing Status**:
- Scheduled: Hearing date is in the future
- Today: Hearing date is current date
- Missed: Hearing date is in the past and status is not Completed
- Completed: Hearing is marked as completed by user

### 4.5 Task Status Logic

**Task Status Calculation**:
- Pending: Task is not started
- In Progress: Task is started but not completed
- Completed: Task is marked as completed by user
- Overdue: Task due date is in the past and status is not Completed

### 4.6 CNR Extraction Logic

**Extraction Process**:
- User inputs CNR number
- Fetch case details from external API or database
- Parse extracted data
- Auto-populate case creation form with extracted details
- Store extraction record in database

### 4.7 Subscription Logic

**Trial Period**:
- New users receive 7-day free trial
- Trial status changes to Expired after 7 days

**Subscription Status**:
- Active: Subscription is paid and valid
- Trial: User is in trial period
- Expired: Subscription or trial has ended

**Recurring Payment**:
- Razorpay recurring subscription charges ₹49/month
- Subscription renews automatically on renewal date

### 4.8 Notification Logic

**Hearing Reminders**:
- Send notification 1 day before hearing date
- Send notification 1 hour before hearing time

**Case Update Notifications**:
- Send notification when case status changes
- Send notification when new hearing is scheduled

**Subscription Alerts**:
- Send notification 3 days before subscription expiry
- Send notification on subscription expiry
- Send notification on payment failure

### 4.9 Activity Log Recording

**Logged Actions**:
- User login
- Case created
- Hearing scheduled
- Document uploaded
- Task completed
- Note added
- Status changed
- Team member added
- Subscription renewed

**Audit Trail**:
- Store all logged actions in Audit Logs table
- Display activity feed on Dashboard and Activities page

## 5. Exceptions and Edge Cases

| Scenario | Handling |
|----------|----------|
| No cases exist | Display empty state with message \"No cases found. Add your first case.\" |
| No hearings scheduled | Display empty state with message \"No hearings scheduled\" |
| No contacts exist | Display empty state with message \"No contacts found. Add your first contact.\" |
| No documents uploaded | Display empty state with message \"No documents uploaded\" |
| Invalid CNR number | Display error message \"Invalid CNR number. Please check and try again.\" |
| CNR extraction API failure | Display error message \"Unable to fetch case details. Please try again later.\" |
| Invalid login credentials | Display error message \"Invalid email or password\" |
| Unauthorized access attempt | Redirect to login page with error message \"You do not have permission to access this page\" |
| Database connection failure | Display error message \"Unable to connect to database. Please check your internet connection.\" |
| Subscription expired | Display banner message \"Your subscription has expired. Please renew to continue using AdvoCal CRM.\" |
| Payment failure | Display error message \"Payment failed. Please update your payment method.\" |
| No data for selected date range | Display empty state with message \"No data available for selected period\" |
| File upload exceeds size limit | Display error message \"File size exceeds limit\" |
| Duplicate case number | Display error message \"Case number already exists\" |
| Missing required fields | Display validation error and highlight missing fields |

## 6. Acceptance Criteria

1. User logs in successfully with valid credentials and reaches Dashboard
2. User views Dashboard with 4 KPI cards showing Total Cases, Active Cases, Upcoming Hearings, Revenue This Month
3. User views Matters Pipeline Kanban board with 5 columns and matter cards
4. User navigates to Contacts page and views list of all contacts
5. User adds new contact with name, email, phone and saves successfully
6. User navigates to Matters page and views list of all matters
7. User adds new matter with case title, case number, client, court, judge and saves successfully
8. User navigates to Calendar page and views monthly calendar with hearing indicators
9. User adds new hearing with case, court, judge, date, time and saves successfully
10. User navigates to CNR Extraction page, inputs CNR number, extracts case details, and creates case successfully
11. User navigates to Documents page, uploads PDF document, links to matter, and saves successfully
12. User navigates to Subscription page and views current subscription status and billing history

## 7. Out of Scope for Current Release

- Court integrations for live case status updates
- AI-powered case summaries
- Document OCR for automatic text extraction
- Team chat and real-time collaboration
- Advanced analytics with custom date ranges and filters
- Multi-language support
- Mobile responsive design optimization
- Dark mode theme
- Two-factor authentication
- Export data to CSV or Excel
- Email notification integration
- SMS notification integration
- Automated subscription renewal reminders
- Refund processing interface
- Invoice generation for subscriptions
- Bulk user import/export
- API key management for third-party integrations
- Webhook configuration for external services
- Custom dashboard widgets
- Scheduled reports generation
- Data backup and restore functionality
- User feedback and support ticket management
- In-app messaging with clients
- Payment gateway integration for manual subscription activation
- Subscription plan A/B testing
- Automated user segmentation
- Marketing campaign management
- Referral program tracking
- Client performance scoring
- Case outcome tracking and statistics
- Court-wise hearing statistics
- Judge-wise case statistics