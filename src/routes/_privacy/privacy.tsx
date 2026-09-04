import { createFileRoute } from '@tanstack/react-router';
import styles from './privacy.module.css';

export const Route = createFileRoute('/_privacy/privacy')({
  head: () => ({ meta: [{ title: 'Privacy Policy | LunaShare' }] }),
  component: PrivacyPage,
});

const LAST_UPDATED = new Date('2025-03-09').toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function PrivacyPage() {
  return (
    <section className={styles.doc}>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last Updated: {LAST_UPDATED}</p>

      <div className={styles.sections}>
        <Section title="1. Introduction">
          <p>
            At Lunashare, we are committed to protecting your privacy and ensuring the security of your personal information. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your information when you use our platform, including our website,
            mobile applications, and all related services (collectively, the "Service").
          </p>
          <p>
            Please read this Privacy Policy carefully. By accessing or using our Service, you acknowledge that you have read, understood,
            and agree to be bound by the terms of this Privacy Policy. If you do not agree with our policies and practices, please do not
            use our Service.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p>We collect several types of information from and about users of our Service, including:</p>
          <SubHeading>2.1 Personal Data</SubHeading>
          <p>Personal information that you provide to us, which may include:</p>
          <List
            items={[
              'Contact information (such as name, email address)',
              'Account credentials (such as username and password)',
              'Profile information (such as profile picture, bio)',
              'Communications you send to us (such as customer support inquiries)',
            ]}
          />
          <SubHeading>2.2 Content Data</SubHeading>
          <p>Information related to the audio content you upload, create, or interact with:</p>
          <List
            items={[
              'Audio files you upload or create using our Service',
              'Metadata associated with your audio files (such as titles, descriptions, tags)',
              'Information about your musical preferences and listening history',
              'AI-generated content from our tools and your interactions with them',
            ]}
          />
          <SubHeading>2.3 Usage Data</SubHeading>
          <p>Information about how you use our Service:</p>
          <List
            items={[
              'Log data (such as IP address, browser type, pages visited, time and date of visit)',
              'Device information (such as device type, operating system)',
              'Behavioral data (such as features used, content viewed, interactions with other users)',
              'Performance data (such as crash reports, app analytics)',
            ]}
          />
        </Section>

        <Section title="3. How We Collect Information">
          <SubHeading>3.1 Direct Collection</SubHeading>
          <p>We collect information directly from you when you:</p>
          <List
            items={[
              'Create an account or register with the Service',
              'Complete your profile information',
              'Upload or create audio content',
              'Communicate with us or other users',
              'Participate in surveys or promotions',
            ]}
          />
          <SubHeading>3.2 Automated Collection</SubHeading>
          <p>We automatically collect certain information when you use our Service through:</p>
          <List items={['Cookies and similar tracking technologies', 'Server logs', 'Analytics tools', 'Device information']} />
          <SubHeading>3.3 Third-Party Sources</SubHeading>
          <p>We may receive information about you from:</p>
          <List
            items={[
              'Social media platforms when you connect your account',
              'Third-party service providers that help us operate our Service',
            ]}
          />
        </Section>

        <Section title="4. How We Use Your Information">
          <p>We use the information we collect for various purposes, including:</p>
          <SubHeading>4.1 Provide and Improve the Service</SubHeading>
          <List
            items={[
              'Create and manage your account',
              'Deliver the audio content you request',
              'Develop new features and improve existing ones',
            ]}
          />
          <SubHeading>4.2 Communication</SubHeading>
          <List
            items={[
              'Respond to your inquiries and support requests',
              'Send you service-related notifications',
              'Provide you with updates about new features or content',
              'Send promotional messages (with your consent, this is opt-in)',
            ]}
          />
          <SubHeading>4.3 Security and Protection</SubHeading>
          <List
            items={[
              'Detect and prevent fraudulent or unauthorized activity',
              'Enforce our Terms of Service and other policies',
              'Protect the rights and safety of our users and third parties',
              'Comply with legal obligations',
            ]}
          />
        </Section>

        <Section title="5. How We Share Your Information">
          <p>We may share your information with the following categories of recipients:</p>
          <SubHeading>5.1 Other Users</SubHeading>
          <p>
            Depending on your privacy settings, information such as your profile, uploaded content, and activity may be visible to other
            users of the Service. You can control certain aspects of information sharing through your account settings.
          </p>
          <SubHeading>5.2 Service Providers</SubHeading>
          <p>
            We may share information with third-party vendors, service providers, and contractors who perform services on our behalf, such
            as:
          </p>
          <List items={['Cloud storage providers', 'Email and communication services']} />
          <SubHeading>5.3 Legal Requirements</SubHeading>
          <p>
            We may disclose your information if required to do so by law or in response to valid requests from public authorities (e.g.,
            court order, government request). We may also disclose your information to:
          </p>
          <List
            items={[
              'Enforce our rights arising from agreements between you and us',
              'Protect the rights, property, or safety of Lunashare, our users, or others',
              'Prevent or investigate possible wrongdoing in connection with the Service',
            ]}
          />
        </Section>

        <Section title="6. Cookies and Tracking Technologies">
          <p>
            We use cookies and similar tracking technologies to track activity on our Service and hold certain information. Cookies are
            files with a small amount of data which may include an anonymous unique identifier.
          </p>
          <SubHeading>6.1 Types of Cookies We Use</SubHeading>
          <ul>
            <li>
              <strong>Essential Cookies:</strong> Required for the operation of our Service
            </li>
            <li>
              <strong>Preference Cookies:</strong> Allow us to remember your preferences and settings
            </li>
          </ul>
          <SubHeading>6.2 Your Cookie Choices</SubHeading>
          <p>
            Most web browsers allow you to control cookies through their settings preferences. However, if you limit the ability of websites
            to set cookies, you may impact your overall user experience. You can find information about managing cookies in your browser at
            the browser's website.
          </p>
        </Section>

        <Section title="7. Data Security">
          <p>
            We implement appropriate technical and organizational measures to protect the security of your personal information. However,
            please also recognize that no method of transmission over the Internet or method of electronic storage is 100% secure. While we
            strive to use commercially acceptable means to protect your personal information, we cannot guarantee its absolute security.
          </p>
          <p>In the event of a data breach that affects your personal information, we will notify you in compliance with applicable law.</p>
        </Section>

        <Section title="8. Data Retention">
          <p>
            We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a
            longer retention period is required or permitted by law. The criteria used to determine our retention periods include:
          </p>
          <List
            items={[
              'The length of time we have an ongoing relationship with you',
              'Our legal obligations under applicable laws',
              'Whether retention is advisable considering our legal position (such as for statutes of limitations, litigation, or regulatory investigations)',
            ]}
          />
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            Our Service is not directed to children under the age of 13, and we do not knowingly collect personal information from children
            under 13. If we learn that we have collected personal information from a child under 13, we will promptly take steps to delete
            that information.
          </p>
          <p>
            If you are a parent or guardian and believe that your child has provided us with personal information without your consent,
            please contact us at <ContactLink email="privacy@lunashare.com" />.
          </p>
        </Section>

        <Section title="10. Your Rights and Choices">
          <p>Depending on your location, you may have certain rights regarding your personal information. These may include:</p>
          <ul>
            <li>
              <strong>Access:</strong> Request a copy of the personal information we hold about you
            </li>
            <li>
              <strong>Rectification:</strong> Correct inaccurate or incomplete information
            </li>
            <li>
              <strong>Deletion:</strong> Request that we delete your personal information
            </li>
            <li>
              <strong>Restriction:</strong> Request that we limit the processing of your data
            </li>
            <li>
              <strong>Data Portability:</strong> Receive your data in a structured, commonly used format
            </li>
            <li>
              <strong>Objection:</strong> Object to the processing of your personal information
            </li>
            <li>
              <strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent
            </li>
          </ul>
          <p>
            To exercise these rights, please contact us at <ContactLink email="privacy@lunashare.com" />. We may need to verify your
            identity before responding to your request.
          </p>
        </Section>

        <Section title="11. Music and Audio Privacy Considerations">
          <p>As a music and audio sharing platform, we handle content that may have special privacy considerations:</p>
          <ul>
            <li>
              <strong>Content Ownership:</strong> You retain ownership of the audio content you create and upload, subject to the license
              you grant us in our Terms of Service.
            </li>
            <li>
              <strong>AI-Generated Content:</strong> When you use our AI tools to generate audio content, we may analyze your inputs and the
              resulting outputs to improve our algorithms. The content you generate remains yours, though we maintain rights to the
              underlying technology.
            </li>
          </ul>
        </Section>

        <Section title="12. Changes to This Privacy Policy">
          <p>
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this
            page and updating the "Last Updated" date. You are advised to review this Privacy Policy periodically for any changes.
          </p>
          <p>
            Significant changes will be notified to you via email or through a notice on our Service prior to the change becoming effective.
            Your continued use of the Service after such modifications will constitute your acknowledgment of the modified Privacy Policy.
          </p>
        </Section>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3>{children}</h3>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ContactLink({ email }: { email: string }) {
  return <a href={`mailto:${email}`}>{email}</a>;
}
