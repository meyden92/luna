import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_privacy/tos')({
  head: () => ({ meta: [{ title: 'Terms of Service | LunaShare' }] }),
  component: ToSPage,
});

const LAST_UPDATED = new Date('2025-03-09').toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function ToSPage() {
  return (
    <section className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
      <p className="text-sm text-gray-600 mb-6">Last Updated: {LAST_UPDATED}</p>

      <div className="space-y-8">
        <Section title="1. Agreement to Terms">
          <p className="mb-3">
            Welcome to Lunashare. These Terms of Service ("Terms") govern your access to and use of the Lunashare platform, including our
            website, mobile applications, and all related services (collectively, the "Service"). By accessing or using the Service, you
            agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use the Service.
          </p>
          <p>
            The Service is operated by Lunashare ("we," "us," or "our"). We reserve the right to update or modify these Terms at any time
            without prior notice. Your continued use of the Service following any changes constitutes your acceptance of the revised Terms.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p className="mb-3">
            You must be at least 13 years old to use the Service. If you are under 18 years old, you must have permission from a parent or
            guardian to use the Service, and they must agree to these Terms on your behalf. By using the Service, you represent and warrant
            that you meet these eligibility requirements.
          </p>
        </Section>

        <Section title="3. User Accounts">
          <p className="mb-3">
            To access certain features of the Service, you may need to create an account. You are responsible for maintaining the
            confidentiality of your account credentials and for all activities that occur under your account. You agree to:
          </p>
          <List
            items={[
              'Provide accurate, current, and complete information during registration',
              'Maintain and promptly update your account information',
              'Notify us immediately of any unauthorized access or use of your account',
              'Take responsibility for all activities that occur under your account',
            ]}
          />
          <p>
            We reserve the right to disable any user account if we believe you have violated these Terms or if we determine, in our sole
            discretion, that your account activity threatens the integrity, security, or functionality of the Service.
          </p>
        </Section>

        <Section title="4. Intellectual Property Rights">
          <p className="mb-3">
            <strong>Our Content:</strong> The Service and its contents, including but not limited to text, graphics, user interface, logos,
            button icons, images, audio clips, digital downloads, data compilations, and software, are owned by us or our licensors and are
            protected by copyright, trademark, and other intellectual property laws.
          </p>
          <p className="mb-3">
            <strong>Your License to Use Our Service:</strong> Subject to your compliance with these Terms, we grant you a limited,
            non-exclusive, non-transferable, and revocable license to access and use the Service for personal, non-commercial purposes.
          </p>
          <p>
            <strong>Your Content:</strong> You retain all rights to any content you upload, submit, or display through the Service ("User
            Content"). By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify,
            adapt, publish, translate, distribute, and display such content in connection with providing and promoting the Service.
          </p>
        </Section>

        <Section title="5. User Content Guidelines">
          <p className="mb-3">
            You are solely responsible for your User Content and the consequences of sharing it. You represent and warrant that:
          </p>
          <List
            items={[
              'You own or have the necessary rights to share your User Content',
              'Your User Content does not infringe or violate the rights of any third party',
              'Your User Content complies with all applicable laws and regulations',
            ]}
          />
          <p className="mb-3">Prohibited content includes, but is not limited to:</p>
          <List
            items={[
              'Content that infringes copyright, trademark, or other intellectual property rights',
              'Illegal, obscene, defamatory, threatening, intimidating, harassing, or offensive content',
              'Content that promotes discrimination, bigotry, racism, or harm against any group or individual',
              'Content that contains computer viruses or harmful code',
              'Content that impersonates another person or entity',
            ]}
          />
          <p>
            We reserve the right, but not the obligation, to remove or refuse any User Content that violates these Terms or that we find
            objectionable for any reason, without prior notice.
          </p>
        </Section>

        <Section title="6. Music and Audio Content">
          <p className="mb-3">
            <strong>User-Generated Music:</strong> If you upload original music or audio content, you retain all ownership rights to your
            original compositions. By uploading such content, you grant Lunashare a non-exclusive, worldwide, royalty-free license to use,
            reproduce, distribute, and display your content solely for the purpose of providing and promoting the Service.
          </p>
          <p className="mb-3">
            <strong>AI-Generated Content:</strong> If you create content using our AI tools, you are responsible for ensuring that such use
            complies with all applicable laws and third-party rights. You retain ownership of the output generated through your use of our
            AI features, subject to our underlying rights in the AI technology.
          </p>
          <p className="mb-3">
            <strong>Copyright Compliance:</strong> You must not upload, stream, or share any music or audio content unless:
          </p>
          <List
            items={[
              'You own all rights to the content',
              'You have received express permission from the copyright owner',
              'Your use is authorized by applicable law, such as fair use',
            ]}
          />
          <p>
            We respect the intellectual property rights of others and expect our users to do the same. We will respond to notices of alleged
            copyright infringement as described in our Copyright Policy below.
          </p>
        </Section>

        <Section title="7. Digital Millennium Copyright Act (DMCA)">
          <p className="mb-3">
            If you believe that your copyrighted work has been used or displayed on our Service in a way that constitutes copyright
            infringement, please send a notification containing the following information to our designated copyright agent:
          </p>
          <List
            items={[
              'A physical or electronic signature of the copyright owner or a person authorized to act on their behalf',
              'Identification of the copyrighted work claimed to have been infringed',
              'Identification of the material that is claimed to be infringing and information reasonably sufficient to locate it',
              'Your contact information, including address, telephone number, and email',
              'A statement that you have a good faith belief that use of the material is not authorized by the copyright owner',
              'A statement that the information is accurate and, under penalty of perjury, that you are authorized to act on behalf of the copyright owner',
            ]}
          />
          <p>
            Our designated copyright agent can be reached at:{' '}
            <a
              href="mailto:copyright@lunashare.com"
              className="text-blue-600 hover:underline"
            >
              copyright@lunashare.com
            </a>
          </p>
        </Section>

        <Section title="8. Privacy">
          <p className="mb-3">
            Our Privacy Policy explains how we collect, use, and protect your personal information. By using our Service, you agree to our
            collection and use of information as described in our Privacy Policy.
          </p>
        </Section>

        <Section title="9. Third-Party Services and Links">
          <p className="mb-3">
            Our Service may contain links to third-party websites or services that are not owned or controlled by us. We have no control
            over and assume no responsibility for the content, privacy policies, or practices of any third-party websites or services. You
            acknowledge and agree that we shall not be responsible or liable for any damage or loss caused by your use of any such websites
            or services.
          </p>
        </Section>

        <Section title="10. Termination">
          <p className="mb-3">
            We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any
            reason, including if you breach these Terms. Upon termination, your right to use the Service will immediately cease.
          </p>
          <p>
            You may terminate your account at any time by discontinuing use of the Service and deleting your account. Some provisions of
            these Terms will survive termination, including ownership provisions, warranty disclaimers, limitations of liability, and
            dispute resolution provisions.
          </p>
        </Section>

        <Section title="11. Disclaimer of Warranties">
          <p className="mb-3">
            THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
            INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR
            COURSE OF PERFORMANCE.
          </p>
          <p>
            We do not warrant that the Service will function uninterrupted, secure, or available at any particular time or location, that
            any errors or defects will be corrected, or that the Service is free of viruses or other harmful components.
          </p>
        </Section>

        <Section title="12. Limitation of Liability">
          <p className="mb-3">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:
          </p>
          <List
            items={[
              'Your access to or use of or inability to access or use the Service',
              'Any content obtained from the Service',
              'Unauthorized access, use, or alteration of your transmissions or content',
            ]}
          />
          <p>
            In no event shall our total liability to you for all claims arising from or relating to the Service exceed the amount paid by
            you, if any, for accessing the Service during the twelve (12) months preceding the claim.
          </p>
        </Section>

        <Section title="13. Indemnification">
          <p className="mb-3">
            You agree to defend, indemnify, and hold harmless us and our affiliates, officers, directors, employees, and agents from and
            against any and all claims, damages, obligations, losses, liabilities, costs, or debt, and expenses (including but not limited
            to attorney's fees) arising from:
          </p>
          <List
            items={[
              'Your use of and access to the Service',
              'Your violation of any term of these Terms',
              'Your violation of any third-party right, including without limitation any copyright, property, or privacy right',
              'Any claim that your User Content caused damage to a third party',
            ]}
          />
          <p>This defense and indemnification obligation will survive these Terms and your use of the Service.</p>
        </Section>

        <Section title="14. Changes to Terms">
          <p className="mb-3">
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any
            changes by updating the "Last Updated" date at the top of these Terms. Your continued use of the Service after any such changes
            constitutes your acceptance of the new Terms.
          </p>
        </Section>
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 mb-3 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
