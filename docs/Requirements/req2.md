# Requirements Enhancements
1. We must have a login System 
2. A user can have multiple Spaces ,
    A Space is an isolated financial workspace that contains its own: Contacts, Loans, Transactions, Reports etc.
    Each space operates independently while allowing users to switch between spaces seamlessly.
    No GLobal calculation/ Dashboard will be their to calculate the accumulated data of all space for that user. 
    Platform Data is Space specific and space map to user. 
    Space TYPES: Personal Space, Shared Spaces.
    1. PRIVATE SPACE
        A space owned and managed by a single user.

        Characteristics:

        - Single owner
        - Data visible only to owner
        - Complete isolation from other spaces
    
    2. SHARED SPACE
        A collaborative workspace shared between multiple users.

        Characteristics:

        - Multiple members
        - Role-based permissions
        - Shared visibility of records
        - Shared reporting and analytics

    SPACE TEMPLATES:
    When creating a new space, users may choose:
        - Personal
        - Business
    
    In Business , it has Space TYPES Options (Personal , Shared)

3. Every shared space contains members.( minimum 1 member the owner itselt)

    Member Roles:
    - OWNER
    - ADMIN
    - VIEWER
    - FieldMan
    ---------------------------------------------------------
    VISIBILITY MATRIX
    ---------------------------------------------------------

    Feature                    Owner  Admin  Viewer  FieldMan

    Dashboard                  YES    YES    YES     NO
    Portfolio Analytics        YES    YES    YES     NO
    Reports                    YES    YES    YES     NO
    Loans                       YES    YES    YES     View Only
    Contacts                    YES    YES    YES     View Only
    Transactions                YES    YES    YES     View Only
    Add Payment                 YES    YES    NO      YES
    Add Notes                   YES    YES    NO      YES
    Manage Members              YES    NO     NO      NO
    Delete Space                YES    NO     NO      NO
    Settings                    YES    NO     NO      NO
    Export Data                 YES    YES     NO      NO

    FIELDMAN
    ---------------------------------------------------------

    Field collection / recovery / relationship management role.

    Designed for people who interact with borrowers, lenders, customers, tenants, vendors, etc. in the real world.

    Permissions:

    ✓ View contacts
    ✓ View loans
    ✓ View repayment schedules
    ✓ Record collections
    ✓ Record payments
    ✓ Add notes
    ✓ Update visit status
    ✓ Add collection remarks
    ✓ Mark payment promises
    ✓ View activity history for assigned records

    Restrictions:

    ✗ Cannot view overall dashboard
    ✗ Cannot view portfolio analytics
    ✗ Cannot view total receivables
    ✗ Cannot view total payables
    ✗ Cannot view total interest earned
    ✗ Cannot view total interest paid
    ✗ Cannot view organization-level reports
    ✗ Cannot export data
    ✗ Cannot manage members
    ✗ Cannot modify settings
    ✗ Cannot delete loans
    ✗ Cannot delete transactions

    Purpose:

    Collection agents, field executives, recovery staff, property managers, local representatives.


4. BUSINESS SPACE PARTNERSHIP MODEL:
    Applicable only for:
    Space Type = BUSINESS
    and
    Space Visibility = SHARED

    OVERVIEW:
    - Partner Contribution
         Owner/Admin members can optionally define:

        - Contribution Amount or 
        - Profit Share %
    
        Examples:
        Dhruv      ₹5,00,000   50%
        Partner A  ₹3,00,000   30%
        Partner B  ₹2,00,000   20%

        Contribution can be empty/null.
    
    Apart from Main / business Dashboard , we will provide a Partner Dashboard ( put in suitable area not on main dashboard can be in reports)
        Each partner should see:

        - Their Contribution
        - Their Share %
        - Profit Allocated
        - Loss Allocated
        - Current Net Position



5. we must provide a tab to ask to reduce the expenses amt from the final calculations for Reports, Dashboards specific fields.
6. in a loan given scenerio: if someone pay more than the EMI for that time(e.g. some money in adv ) then do we have to calc rest EMIs by recalc. remaining amount or remind that adv and sort it for next time  payment   - that cace "we must provide a tab"
