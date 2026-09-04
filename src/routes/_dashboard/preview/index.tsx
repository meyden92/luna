import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckboxField,
  DateField,
  DateTimeField,
  FileField,
  Form,
  FormArray,
  FormErrors,
  FormReset,
  FormSubmit,
  FormSubscribe,
  FormWithSchema,
  InputField,
  NumberField,
  RadioField,
  SelectField,
  SwitchField,
  TextareaField,
} from '@/components/ui/tanstack-form';
import { cn } from '@/libs/utils';
import styles from './index.module.css';

const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Invalid email address'),
  age: z.number().min(18, 'Must be at least 18 years old').max(120, 'Must be under 120'),
  bio: z.string().optional(),
  country: z.string().min(1, 'Please select a country'),
  newsletter: z.boolean(),
  notifications: z.boolean(),
  birthDate: z.string().min(1, 'Birth date is required'),
  appointmentTime: z.string().optional(),
  avatar: z.any().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer-not-to-say']),
});

type UserFormData = z.infer<typeof userSchema>;

export const Route = createFileRoute('/_dashboard/preview/')({
  head: () => ({ meta: [{ title: 'Preview | LunaShare' }] }),
  component: PreviewPage,
});

function PreviewPage() {
  const [submittedData, setSubmittedData] = useState<any>(null);

  const handleBasicSubmit = async (data: any) => {
    toast.success('Basic form submitted successfully!');
    setSubmittedData(data);
  };

  const handleValidatedSubmit = async (data: UserFormData) => {
    toast.success('Validated form submitted successfully!');
    setSubmittedData(data);
  };

  const handleAsyncSubmit = async (data: any) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    toast.success('Async form submitted successfully!');
    setSubmittedData(data);
  };

  const handleAdvancedSubmit = async (data: any) => {
    toast.success('Advanced form submitted successfully!');
    setSubmittedData(data);
  };

  return (
    <div className="container pad-y-8 stack space-8">
      <div className={cn(styles.header, 'stack space-4')}>
        <h1 className="type-4xl weight-bold">TanStack Form Component Showcase</h1>
        <p className={cn('type-lg', styles.subtitle)}>
          Explore the comprehensive TanStack Form components with validation, field types, and advanced features.
        </p>
      </div>

      <Tabs
        defaultValue="basic"
        className={styles.full}
      >
        <TabsList className={styles.tabsList}>
          <TabsTrigger value="basic">Basic Forms</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="async">Async Features</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent
          value="basic"
          className="stack space-8"
        >
          <div className={styles.formGrid2}>
            <Card>
              <CardHeader>
                <CardTitle>Simple Contact Form</CardTitle>
                <CardDescription>Basic form with common field types</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: { name: '', email: '', message: '', urgent: false },
                    onSubmit: handleBasicSubmit,
                  }}
                >
                  <InputField
                    name="name"
                    label="Full Name"
                    placeholder="Enter your full name"
                    description="This will be displayed publicly"
                  />
                  <InputField
                    name="email"
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                  />
                  <TextareaField
                    name="message"
                    label="Message"
                    placeholder="Tell us what's on your mind..."
                    rows={4}
                  />
                  <CheckboxField
                    name="urgent"
                    label="This is urgent"
                    description="Check if this requires immediate attention"
                  />
                  <div className="cluster space-2">
                    <FormSubmit>Send Message</FormSubmit>
                    <FormReset>Clear Form</FormReset>
                  </div>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Profile Form</CardTitle>
                <CardDescription>Comprehensive user information form</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: {
                      firstName: '',
                      lastName: '',
                      age: undefined,
                      country: '',
                      bio: '',
                      notifications: true,
                      theme: 'light',
                    },
                    onSubmit: handleBasicSubmit,
                  }}
                >
                  <div className={styles.fieldGrid2}>
                    <InputField
                      name="firstName"
                      label="First Name"
                      placeholder="John"
                    />
                    <InputField
                      name="lastName"
                      label="Last Name"
                      placeholder="Doe"
                    />
                  </div>
                  <NumberField
                    name="age"
                    label="Age"
                    placeholder="25"
                    min={18}
                    max={120}
                    description="Must be 18 or older"
                  />
                  <SelectField
                    name="country"
                    label="Country"
                    placeholder="Select your country"
                    options={[
                      { value: 'us', label: 'United States' },
                      { value: 'uk', label: 'United Kingdom' },
                      { value: 'de', label: 'Germany' },
                      { value: 'fr', label: 'France' },
                      { value: 'jp', label: 'Japan' },
                      { value: 'au', label: 'Australia' },
                    ]}
                  />
                  <TextareaField
                    name="bio"
                    label="Bio"
                    placeholder="Tell us about yourself..."
                    optional
                  />
                  <SwitchField
                    name="notifications"
                    label="Enable Notifications"
                    description="Receive email notifications about updates"
                  />
                  <RadioField
                    name="theme"
                    label="Preferred Theme"
                    options={[
                      { value: 'light', label: 'Light Mode' },
                      { value: 'dark', label: 'Dark Mode' },
                      { value: 'system', label: 'System Default' },
                    ]}
                  />
                  <FormSubmit>Save Profile</FormSubmit>
                </Form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="validation"
          className="stack space-8"
        >
          <div className={styles.formGrid2}>
            <Card>
              <CardHeader>
                <CardTitle>Zod Schema Validation</CardTitle>
                <CardDescription>Form with comprehensive Zod validation</CardDescription>
              </CardHeader>
              <CardContent>
                <FormWithSchema
                  config={{
                    schema: userSchema,
                    defaultValues: {
                      name: '',
                      email: '',
                      age: undefined,
                      bio: '',
                      country: '',
                      newsletter: false,
                      notifications: true,
                      birthDate: '',
                      appointmentTime: '',
                      gender: 'prefer-not-to-say',
                    },
                    onSubmit: handleValidatedSubmit,
                  }}
                >
                  <FormErrors />
                  <InputField
                    name="name"
                    label="Full Name"
                    placeholder="Enter your full name"
                  />
                  <InputField
                    name="email"
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                  />
                  <NumberField
                    name="age"
                    label="Age"
                    placeholder="25"
                    min={18}
                    max={120}
                  />
                  <TextareaField
                    name="bio"
                    label="Bio"
                    placeholder="Tell us about yourself..."
                    optional
                  />
                  <SelectField
                    name="country"
                    label="Country"
                    placeholder="Select your country"
                    options={[
                      { value: 'us', label: 'United States' },
                      { value: 'uk', label: 'United Kingdom' },
                      { value: 'de', label: 'Germany' },
                      { value: 'fr', label: 'France' },
                    ]}
                  />
                  <DateField
                    name="birthDate"
                    label="Birth Date"
                    max={new Date().toISOString().split('T')[0]}
                  />
                  <DateTimeField
                    name="appointmentTime"
                    label="Appointment Time"
                    optional
                    min={new Date().toISOString().slice(0, 16)}
                  />
                  <RadioField
                    name="gender"
                    label="Gender"
                    options={[
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                      { value: 'other', label: 'Other' },
                      { value: 'prefer-not-to-say', label: 'Prefer not to say' },
                    ]}
                  />
                  <div className={styles.fieldGrid2}>
                    <CheckboxField
                      name="newsletter"
                      label="Subscribe to Newsletter"
                      description="Get weekly updates"
                    />
                    <SwitchField
                      name="notifications"
                      label="Push Notifications"
                      description="Receive push notifications"
                    />
                  </div>
                  <FileField
                    name="avatar"
                    label="Profile Picture"
                    accept="image/*"
                    optional
                  />
                  <FormSubmit loadingText="Validating...">Submit with Validation</FormSubmit>
                </FormWithSchema>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Custom Validation</CardTitle>
                <CardDescription>Form with custom validation logic</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: { username: '', password: '', confirmPassword: '', website: '' },
                    onSubmit: handleBasicSubmit,
                    validators: {
                      onChange: ({ value }: any) => {
                        if (value.password && value.confirmPassword && value.password !== value.confirmPassword) {
                          return 'Passwords do not match';
                        }
                        return undefined;
                      },
                    },
                  }}
                >
                  <InputField
                    name="username"
                    label="Username"
                    placeholder="Enter username"
                    validators={{
                      onChange: ({ value }: any) => {
                        if (!value) return 'Username is required';
                        if (value.length < 3) return 'Username must be at least 3 characters';
                        if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Username can only contain letters, numbers, and underscores';
                        return undefined;
                      },
                    }}
                  />
                  <InputField
                    name="password"
                    label="Password"
                    type="password"
                    placeholder="Enter password"
                    validators={{
                      onChange: ({ value }: any) => {
                        if (!value) return 'Password is required';
                        if (value.length < 8) return 'Password must be at least 8 characters';
                        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
                          return 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
                        }
                        return undefined;
                      },
                    }}
                  />
                  <InputField
                    name="confirmPassword"
                    label="Confirm Password"
                    type="password"
                    placeholder="Confirm your password"
                    validators={{
                      onChangeListenTo: ['password'],
                      onChange: () => undefined,
                    }}
                  />
                  <InputField
                    name="website"
                    label="Website"
                    placeholder="https://example.com"
                    optional
                    validators={{
                      onChange: ({ value }: any) => {
                        if (value && !/^https?:\/\/.+\..+/.test(value)) return 'Please enter a valid URL';
                        return undefined;
                      },
                    }}
                  />
                  <FormSubmit>Create Account</FormSubmit>
                </Form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="async"
          className="stack space-8"
        >
          <div className={styles.formGrid2}>
            <Card>
              <CardHeader>
                <CardTitle>Async Validation</CardTitle>
                <CardDescription>Form with async validation (simulated API calls)</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: { email: '', username: '' },
                    onSubmit: handleAsyncSubmit,
                  }}
                >
                  <InputField
                    name="email"
                    label="Email Address"
                    type="email"
                    placeholder="you@example.com"
                    validators={{
                      onChangeAsync: async ({ value }: any) => {
                        if (!value) return 'Email is required';
                        if (!/\S+@\S+\.\S+/.test(value)) return 'Invalid email format';
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                        const taken = ['admin@example.com', 'test@test.com'];
                        if (taken.includes(value)) return 'This email is already registered';
                        return undefined;
                      },
                      onChangeAsyncDebounceMs: 500,
                    }}
                  />
                  <InputField
                    name="username"
                    label="Username"
                    placeholder="Enter username"
                    validators={{
                      onChangeAsync: async ({ value }: any) => {
                        if (!value) return 'Username is required';
                        if (value.length < 3) return 'Username must be at least 3 characters';
                        await new Promise((resolve) => setTimeout(resolve, 800));
                        const taken = ['admin', 'test', 'user', 'john'];
                        if (taken.includes(value.toLowerCase())) return 'This username is already taken';
                        return undefined;
                      },
                      onChangeAsyncDebounceMs: 300,
                    }}
                  />
                  <FormSubmit loadingText="Checking availability...">Register</FormSubmit>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Async Initial Values</CardTitle>
                <CardDescription>Form that loads initial values from an API</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: { name: '', email: '', role: '', department: '' },
                    asyncInitialValues: async () => {
                      await new Promise((resolve) => setTimeout(resolve, 1500));
                      return { name: 'John Doe', email: 'john.doe@company.com', role: 'developer', department: 'engineering' };
                    },
                    onSubmit: handleAsyncSubmit,
                  }}
                >
                  <InputField
                    name="name"
                    label="Employee Name"
                    placeholder="Loading..."
                  />
                  <InputField
                    name="email"
                    label="Email Address"
                    type="email"
                    placeholder="Loading..."
                  />
                  <SelectField
                    name="role"
                    label="Role"
                    placeholder="Select role"
                    options={[
                      { value: 'developer', label: 'Developer' },
                      { value: 'designer', label: 'Designer' },
                      { value: 'manager', label: 'Manager' },
                      { value: 'analyst', label: 'Analyst' },
                    ]}
                  />
                  <SelectField
                    name="department"
                    label="Department"
                    placeholder="Select department"
                    options={[
                      { value: 'engineering', label: 'Engineering' },
                      { value: 'design', label: 'Design' },
                      { value: 'marketing', label: 'Marketing' },
                      { value: 'sales', label: 'Sales' },
                    ]}
                  />
                  <FormSubmit>Update Employee</FormSubmit>
                </Form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent
          value="advanced"
          className="stack space-8"
        >
          <div className={styles.formGrid2}>
            <Card>
              <CardHeader>
                <CardTitle>Dynamic Form Arrays</CardTitle>
                <CardDescription>Form with dynamic field arrays and linked fields</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: {
                      projectName: '',
                      teamMembers: [{ name: '', role: '', email: '' }],
                      totalMembers: 1,
                    },
                    onSubmit: handleAdvancedSubmit,
                  }}
                >
                  <InputField
                    name="projectName"
                    label="Project Name"
                    placeholder="Enter project name"
                  />
                  <FormArray
                    name="teamMembers"
                    renderItemAction={({ fields, append, remove }) => (
                      <div className="stack space-4">
                        <div className={styles.rowBetween}>
                          <h4 className="type-lg weight-medium">Team Members</h4>
                          <Badge variant="secondary">
                            {fields.length} member{fields.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>

                        {fields.map((field: any, index: number) => (
                          <Card
                            key={field.key}
                            className={styles.memberCard}
                          >
                            <div className={cn(styles.rowBetween, 'margin-bottom-4')}>
                              <h5 className="weight-medium">Member {index + 1}</h5>
                              {fields.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => remove(index)}
                                  className={styles.removeButton}
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <div className={styles.fieldGrid3}>
                              <InputField
                                name={`teamMembers.${index}.name`}
                                label="Name"
                                placeholder="John Doe"
                              />
                              <SelectField
                                name={`teamMembers.${index}.role`}
                                label="Role"
                                placeholder="Select role"
                                options={[
                                  { value: 'lead', label: 'Team Lead' },
                                  { value: 'developer', label: 'Developer' },
                                  { value: 'designer', label: 'Designer' },
                                  { value: 'tester', label: 'QA Tester' },
                                ]}
                              />
                              <InputField
                                name={`teamMembers.${index}.email`}
                                label="Email"
                                type="email"
                                placeholder="john@example.com"
                              />
                            </div>
                          </Card>
                        ))}

                        <button
                          type="button"
                          onClick={() => append({ name: '', role: '', email: '' })}
                          className={styles.addButton}
                        >
                          + Add Team Member
                        </button>
                      </div>
                    )}
                  />

                  <FormSubscribe
                    selectorAction={(state: any) => state.values.teamMembers?.length || 0}
                    renderAction={(memberCount: number) => (
                      <div className={cn('type-sm', styles.muted)}>Total team members: {memberCount}</div>
                    )}
                  />

                  <FormSubmit>Create Project</FormSubmit>
                </Form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conditional Fields</CardTitle>
                <CardDescription>Form with fields that appear based on other field values</CardDescription>
              </CardHeader>
              <CardContent>
                <Form
                  config={{
                    defaultValues: {
                      accountType: 'personal',
                      companyName: '',
                      companySize: '',
                      personalInfo: '',
                      hasAddress: false,
                      address: '',
                      city: '',
                      country: '',
                      newsletter: false,
                    },
                    onSubmit: handleAdvancedSubmit,
                  }}
                >
                  <RadioField
                    name="accountType"
                    label="Account Type"
                    options={[
                      { value: 'personal', label: 'Personal Account' },
                      { value: 'business', label: 'Business Account' },
                    ]}
                  />

                  <FormSubscribe
                    selectorAction={(state: any) => state.values.accountType}
                    renderAction={(accountType: string) => (
                      <>
                        {accountType === 'business' && (
                          <>
                            <InputField
                              name="companyName"
                              label="Company Name"
                              placeholder="Enter company name"
                            />
                            <SelectField
                              name="companySize"
                              label="Company Size"
                              placeholder="Select size"
                              options={[
                                { value: '1-10', label: '1-10 employees' },
                                { value: '11-50', label: '11-50 employees' },
                                { value: '51-200', label: '51-200 employees' },
                                { value: '200+', label: '200+ employees' },
                              ]}
                            />
                          </>
                        )}
                        {accountType === 'personal' && (
                          <TextareaField
                            name="personalInfo"
                            label="Personal Information"
                            placeholder="Tell us about yourself..."
                            optional
                          />
                        )}
                      </>
                    )}
                  />

                  <CheckboxField
                    name="hasAddress"
                    label="Add Address Information"
                    description="Include your address details"
                  />

                  <FormSubscribe
                    selectorAction={(state: any) => state.values.hasAddress}
                    renderAction={(hasAddress: boolean) =>
                      hasAddress ? (
                        <div className={cn('stack space-4', styles.addressBox)}>
                          <h4 className="weight-medium">Address Information</h4>
                          <TextareaField
                            name="address"
                            label="Street Address"
                            placeholder="123 Main St, Apt 4B"
                            rows={2}
                          />
                          <div className={styles.fieldGrid2}>
                            <InputField
                              name="city"
                              label="City"
                              placeholder="New York"
                            />
                            <SelectField
                              name="country"
                              label="Country"
                              placeholder="Select country"
                              options={[
                                { value: 'us', label: 'United States' },
                                { value: 'uk', label: 'United Kingdom' },
                                { value: 'ca', label: 'Canada' },
                                { value: 'de', label: 'Germany' },
                              ]}
                            />
                          </div>
                        </div>
                      ) : null
                    }
                  />

                  <SwitchField
                    name="newsletter"
                    label="Subscribe to Newsletter"
                    description="Receive updates and promotions"
                  />

                  <FormSubmit>Complete Registration</FormSubmit>
                </Form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {submittedData && (
        <Card className={styles.resultCard}>
          <CardHeader>
            <CardTitle>Last Submitted Data</CardTitle>
            <CardDescription>Preview of the most recently submitted form data</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className={styles.resultPre}>{JSON.stringify(submittedData, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
